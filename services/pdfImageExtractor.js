import { PDFNet } from "@pdftron/pdfnet-node";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";

const execFileAsync = promisify(execFile);

export async function extractPageImagesFromPDF(pdfFilePath) {
    const licenseKey = process.env.PDFTRON_LICENSE_KEY || "";

    if (licenseKey) {
        try {
            console.log(" Using PDFNet for image extraction...");
            const imageBuffers = await extractWithPDFNet(pdfFilePath, licenseKey);
            if (imageBuffers.length > 0) {
                console.log(`PDFNet extracted ${imageBuffers.length} images`);
                return imageBuffers;
            }
            console.log(" PDFNet found 0 embedded images — falling back to pdftoppm page rendering");
        } catch (err) {
            console.warn(" PDFNet failed, falling back to pdftoppm:", err.message);
        }
    }

    return extractWithPdftoppm(pdfFilePath);
}

async function extractWithPDFNet(pdfFilePath, licenseKey) {
    const imageBuffers = [];

    await PDFNet.runWithCleanup(async () => {
        const doc = await PDFNet.PDFDoc.createFromFilePath(pdfFilePath);
        const reader = await PDFNet.ElementReader.create();

        let imageIndex = 0;
        const itr = await doc.getPageIterator();

        for (itr; await itr.hasNext(); await itr.next()) {
            const page = await itr.current();
            const pageNum = await page.getIndex();

            await reader.beginOnPage(page);
            await processElements(reader, pageNum);
            await reader.end();
        }

        async function processElements(reader, pageNum) {
            for (
                let element = await reader.next();
                element !== null;
                element = await reader.next()
            ) {
                const elementType = await element.getType();

                if (
                    elementType === PDFNet.Element.Type.e_image ||
                    elementType === PDFNet.Element.Type.e_inline_image
                ) {
                    try {
                        const tempPath = path.join(
                            os.tmpdir(),
                            `pdfnet_img_${Date.now()}_${imageIndex}.png`
                        );

                        const xobj = await element.getXObject();
                        if (xobj) {
                            const image = await PDFNet.Image.createFromObj(xobj);
                            await image.exportAsPng(tempPath);
                        }

                        if (fs.existsSync(tempPath)) {
                            const buffer = fs.readFileSync(tempPath);
                            if (buffer.length > 500) {
                                imageBuffers.push({ buffer, pageNum });
                                console.log(
                                    `🖼 PDFNet: image ${imageIndex} page ${pageNum} (${buffer.length} bytes)`
                                );
                            }
                            fs.unlinkSync(tempPath);
                            imageIndex++;
                        }
                    } catch (imgErr) {
                        console.warn(` PDFNet image ${imageIndex} skip:`, imgErr.message);
                        imageIndex++;
                    }
                } else if (elementType === PDFNet.Element.Type.e_form) {
                    await reader.formBegin();
                    await processElements(reader, pageNum);
                    await reader.end();
                }
            }
        }
    }, licenseKey);

    return imageBuffers;
}

// pdftoppm: render each PDF page as a PNG (free fallback)
async function extractWithPdftoppm(pdfFilePath) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf_pages_"));
    const outputPrefix = path.join(tmpDir, "page");
    const imageBuffers = [];

    try {
        await execFileAsync("pdftoppm", [
            "-png",
            "-r", "150",
            pdfFilePath,
            outputPrefix,
        ]);

        const files = fs
            .readdirSync(tmpDir)
            .filter((f) => f.endsWith(".png"))
            .sort();

        for (let i = 0; i < files.length; i++) {
            const filePath = path.join(tmpDir, files[i]);
            const buffer = fs.readFileSync(filePath);
            if (buffer.length > 1000) {
                imageBuffers.push({ buffer, pageNum: i + 1 });
                console.log(` pdftoppm: page ${i + 1} (${buffer.length} bytes)`);
            }
        }
    } catch (err) {
        console.error(" pdftoppm error:", err.message);
    } finally {
        try {
            fs.readdirSync(tmpDir).forEach((f) =>
                fs.unlinkSync(path.join(tmpDir, f))
            );
            fs.rmdirSync(tmpDir);
        } catch (_) { }
    }

    return imageBuffers;
}
