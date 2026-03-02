import express from "express";
import multer from "multer";
import mammoth from "mammoth";
import xlsx from "xlsx";
import pdf from "pdf-parse";
import fs from "fs";
import path from "path";
import DocumentChunk from "../models/DocumentChunk.js";
import Document from "../models/Document.js";
import { generateEmbedding } from "../services/embeddingService.js";
import {
  extractFromImageWithGroq,
  extractStructuredFromImage,
  extractTablesFromText,
} from "../services/groqVisionService.js";
import { extractPageImagesFromPDF } from "../services/pdfImageExtractor.js";
import { clearCache } from "../services/lfuCache.js";

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});

const upload = multer({ storage });

function splitByHeadings(text) {
  const lines = text.split("\n");
  const sections = [];
  let currentSection = { title: "General", content: "" };
  const headingRegex = /^([A-Z][A-Z\s\d\(\)]{2,}|[A-Z][a-z]+\s?[A-Z][a-zA-Z\s\d\(\)]{1,})$/;
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    if (headingRegex.test(line)) {
      if (currentSection.content.trim().length > 0) sections.push({ ...currentSection });
      currentSection = { title: line, content: "" };
    } else {
      currentSection.content += line + "\n";
    }
  }
  if (currentSection.content.trim().length > 0) sections.push(currentSection);
  return sections;
}

async function storeChunksWithSections(blocks, filename) {
  const chunkSize = 800;
  const overlap = 150;
  for (const block of blocks) {
    const sections = splitByHeadings(block);
    for (const section of sections) {
      const text = section.content; 
      if (!text || text.trim().length < 20) continue;
      for (let i = 0; i < text.length; i += chunkSize - overlap) {
        const chunk = text.slice(i, i + chunkSize);
        const embedding = await generateEmbedding(chunk);
        if (!embedding || embedding.length === 0) continue;
        await DocumentChunk.create({ filename, type: "text", content: chunk, embedding, section: section.title });
      }
    }
  }
}

function enrichRowWithHeaders(headerCells, rowStr) {
  const cells = rowStr.split("|").map((c) => c.trim());
  return cells
    .map((cell, i) => {
      const header = headerCells[i] || `Col${i + 1}`;
      return `${header}: ${cell}`;
    })
    .join(" | ");
}

async function storeOtherChunks(blocks, filename, type) {
  const sectionName = type === "table" ? "TABLE" : "IMAGE";

  for (const block of blocks) {
    if (!block || block.trim().length < 10) continue;

    if (type === "table") {
      const rows = block.split("\n").filter((r) => r.trim().length > 0);
      if (rows.length === 0) continue;

      const headerRow = rows[0]; 
      const headerCells = headerRow.split("|").map((c) => c.trim());
      const dataRows = rows.slice(1);
      const MAX_ROWS_PER_CHUNK = 20;

      if (rows.length <= MAX_ROWS_PER_CHUNK + 1) {
        const enrichedForEmbedding = [
          headerRow,
          ...dataRows.map((r) => enrichRowWithHeaders(headerCells, r)),
        ].join("\n");
        const embedding = await generateEmbedding(enrichedForEmbedding);
        if (!embedding || embedding.length === 0) continue;
        await DocumentChunk.create({ filename, type, content: block, embedding, section: sectionName });
      } else {
        for (let i = 0; i < dataRows.length; i += MAX_ROWS_PER_CHUNK) {
          const batchDataRows = dataRows.slice(i, i + MAX_ROWS_PER_CHUNK);
          const chunkContent = [headerRow, ...batchDataRows].join("\n");
          const enrichedForEmbedding = [
            headerRow,
            ...batchDataRows.map((r) => enrichRowWithHeaders(headerCells, r)),
          ].join("\n");
          const embedding = await generateEmbedding(enrichedForEmbedding);
          if (!embedding || embedding.length === 0) continue;
          await DocumentChunk.create({ filename, type, content: chunkContent, embedding, section: sectionName });
        }
      }

      if (dataRows.length > 0 && dataRows.length <= 100) {
        for (const row of dataRows) {
          const enriched = enrichRowWithHeaders(headerCells, row);
          const rowContent = `${headerRow}\n${row}`;
          const embedding = await generateEmbedding(enriched);
          if (!embedding || embedding.length === 0) continue;
          await DocumentChunk.create({ filename, type, content: rowContent, embedding, section: sectionName });
        }
        console.log(`  📋 Created ${dataRows.length} per-row table chunks for "${filename}"`);
      }
    } else {
      const chunkSize = 1500;
      const overlap = 200;
      for (let i = 0; i < block.length; i += chunkSize - overlap) {
        const chunk = block.slice(i, i + chunkSize);
        const embedding = await generateEmbedding(chunk);
        if (!embedding || embedding.length === 0) continue;
        await DocumentChunk.create({ filename, type, content: chunk, embedding, section: sectionName });
      }
    }
  }
}

function parseHtmlTables(html) {
  const stripTags = (s) =>
    s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

  const tables = [];

  const tableParts = html.split(/<table[^>]*>/i);
  for (let t = 1; t < tableParts.length; t++) {
    const tableContent = tableParts[t].split(/<\/table>/i)[0];
    const rows = [];

    const rowParts = tableContent.split(/<tr[^>]*>/i);
    for (let r = 1; r < rowParts.length; r++) {
      const rowContent = rowParts[r].split(/<\/tr>/i)[0];
      const cells = [];

      const cellParts = rowContent.split(/<t[dh][^>]*>/i);
      for (let c = 1; c < cellParts.length; c++) {
        const cellContent = cellParts[c].split(/<\/t[dh]>/i)[0];
        cells.push(stripTags(cellContent));
      }

      if (cells.length > 0 && cells.some((c) => c.trim().length > 0)) {
        rows.push(cells.join(" | "));
      }
    }

    if (rows.length > 0) {
      tables.push(rows.join("\n"));
    }
  }

  return tables;
}

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const filename = req.file.originalname;
    const filepath = req.file.path;
    const mimetype = req.file.mimetype;
    const fileBuffer = fs.readFileSync(filepath);
    let extractedTextBlocks = [];
    let extractedTables = [];
    let extractedImages = [];

    if (mimetype === "text/plain") {
      extractedTextBlocks.push(fileBuffer.toString("utf-8"));

    } else if (mimetype.includes("wordprocessingml.document")) {

      const [rawResult, htmlResult] = await Promise.all([
        mammoth.extractRawText({ buffer: fileBuffer }),
        mammoth.convertToHtml({ buffer: fileBuffer }),
      ]);
      if (rawResult.value) extractedTextBlocks.push(rawResult.value);

      const docxTables = parseHtmlTables(htmlResult.value || "");
      console.log(`DOCX tables found: ${docxTables.length}`);
      extractedTables.push(...docxTables);

    } else if (mimetype === "text/csv") {

      extractedTables.push(fileBuffer.toString("utf-8"));

    } else if (mimetype.includes("spreadsheetml.sheet")) {

      const workbook = xlsx.read(fileBuffer, { type: "buffer" });
      workbook.SheetNames.forEach((name) => {
        const sheet = workbook.Sheets[name];
        const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        const tableText = rows
          .filter((r) => r.some((c) => c !== null && c !== undefined && c !== ""))
          .map((row) => row.join(" | "))
          .join("\n");
        if (tableText.trim().length > 10) extractedTables.push(tableText);
      });

    } else if (mimetype === "application/pdf") {

      const pdfData = await pdf(fileBuffer);
      const hasText = pdfData.text && pdfData.text.trim().length > 50;

      if (hasText) {

        extractedTextBlocks.push(pdfData.text);

        console.log(" Extracting tables from PDF text via Groq...");
        const groqResult = await extractTablesFromText(pdfData.text);
        extractedTables.push(...groqResult.tables);


        console.log("🖼 Extracting page images via pdftoppm → Groq Vision...");
        try {
          const imageBuffers = await extractPageImagesFromPDF(filepath);
          console.log(`Rendering complete: ${imageBuffers.length} images extracted`);
          for (let imgIdx = 0; imgIdx < imageBuffers.length; imgIdx++) {
            const { buffer, pageNum } = imageBuffers[imgIdx];
            if (imgIdx > 0) await new Promise((r) => setTimeout(r, 1500));
            const visionResult = await extractStructuredFromImage(buffer, "image/png");

            const rawTexts = (visionResult.textBlocks || []).filter(t => t?.trim().length > 5);
            if (rawTexts.length > 0) {
              const combined = `[Image page ${pageNum}]: ${rawTexts.join(" | ")}`;
              extractedTextBlocks.push(combined);
              for (const t of rawTexts) {
                if (t.trim().length > 80) {
                  extractedTextBlocks.push(`[Image page ${pageNum}]: ${t}`);
                }
              }
              console.log(` Page ${pageNum}: ${rawTexts.length} text blocks merged into 1 combined chunk`);
            }

            if ((visionResult.tables || []).length > 0) {
              extractedTables.push(...visionResult.tables);
              console.log(` Page ${pageNum}: ${visionResult.tables.length} tables from image`);
            }

            const descriptions = (visionResult.imageDescriptions || []).map(
              (d) => `[Image page ${pageNum}]: ${d}`
            );
            if (descriptions.length > 0) {
              extractedImages.push(...descriptions);
              console.log(`  🖼 Page ${pageNum}: ${descriptions.length} visual descriptions`);
            }
          }
        } catch (imgErr) {
          console.warn(" PDF image extraction failed (non-fatal):", imgErr.message);
        }
      } else {
        console.log("Scanned PDF → Using Groq Vision for full extraction");
        const groqResult = await extractStructuredFromImage(fileBuffer, "image/png");
        extractedTextBlocks.push(...(groqResult.textBlocks || []));
        extractedTables.push(...(groqResult.tables || []));
        extractedImages.push(...(groqResult.imageDescriptions || []));
      }

    } else if (mimetype.startsWith("image/")) {
      console.log("🖼 Processing image with Groq Vision");
      const groqResult = await extractStructuredFromImage(fileBuffer, mimetype);
      extractedTextBlocks.push(...(groqResult.textBlocks || []));
      extractedTables.push(...(groqResult.tables || []));
      extractedImages.push(...(groqResult.imageDescriptions || []));

    } else {
      return res.status(400).json({ message: "Unsupported file type" });
    }

    console.log(` Extraction complete → text:${extractedTextBlocks.length} tables:${extractedTables.length} images:${extractedImages.length}`);
    await storeChunksWithSections(extractedTextBlocks, filename);
    await storeOtherChunks(extractedTables, filename, "table");
    await storeOtherChunks(extractedImages, filename, "image");
    await Document.create({ filename, filepath: path.resolve(filepath), uploadedAt: new Date() });
    clearCache(); 
    res.json({
      message: "File processed successfully",
      textBlocks: extractedTextBlocks.length,
      tables: extractedTables.length,
      images: extractedImages.length,
    });
  } catch (error) {
    console.error(" Upload Error:", error);
    res.status(500).json({ message: "Upload failed" });
  }
});

router.get("/documents", async (req, res) => {
  try {
    const docs = await Document.find({}).sort({ uploadedAt: -1 });
    res.json(docs);
  } catch (error) { res.status(500).json({ error: "Failed to fetch documents" }); }
});

router.get("/documents/view/:id", async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).send("File not found in DB");

    let filePath = doc.filepath;

    if (!fs.existsSync(filePath)) {
      const uploadDir = path.resolve("uploads");
      const basename = path.basename(filePath || doc.filename || "");
      filePath = path.join(uploadDir, basename);
    }

    if (!fs.existsSync(filePath)) return res.status(404).send("File missing on server");

    res.sendFile(filePath);
  } catch (err) {
    console.error(" View File Error:", err);
    res.status(500).send("Error opening file");
  }
});

router.delete("/documents/:id", async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    const fullPath = path.join(process.cwd(), doc.filepath);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    await Document.deleteOne({ _id: req.params.id });
    await DocumentChunk.deleteMany({ filename: doc.filename });
    clearCache(); 
    res.json({ message: "Document deleted successfully" });
  } catch (error) { console.error(error); res.status(500).json({ error: "Delete failed" }); }
});

router.get("/debug/embeddings", async (req, res) => {
  try {
    const total = await DocumentChunk.countDocuments();
    const withEmbedding = await DocumentChunk.countDocuments({ "embedding.0": { $exists: true } });

    const samples = await DocumentChunk.find(
      { "embedding.0": { $exists: true } },
      { filename: 1, type: 1, section: 1, content: 1, embedding: 1 }
    ).limit(5);

    res.json({
      summary: {
        totalChunks: total,
        chunksWithEmbedding: withEmbedding,
        chunksWithoutEmbedding: total - withEmbedding,
        embeddingDimensions: samples[0]?.embedding?.length || 0,
      },
      sampleChunks: samples.map((c) => ({
        _id: c._id,
        filename: c.filename,
        type: c.type,
        section: c.section,
        contentPreview: c.content?.slice(0, 120) + "...",
        embeddingLength: c.embedding?.length,
        embeddingFirst5Values: c.embedding?.slice(0, 5),
        embeddingLast5Values: c.embedding?.slice(-5),
        fullEmbedding: c.embedding,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/debug/embeddings/:filename", async (req, res) => {
  try {
    const chunks = await DocumentChunk.find(
      { filename: req.params.filename, "embedding.0": { $exists: true } },
      { filename: 1, type: 1, section: 1, content: 1, embedding: 1 }
    );
    if (!chunks.length) return res.status(404).json({ message: "No chunks found for this filename" });

    res.json({
      filename: req.params.filename,
      totalChunks: chunks.length,
      chunks: chunks.map((c) => ({
        _id: c._id,
        type: c.type,
        section: c.section,
        contentPreview: c.content?.slice(0, 120) + "...",
        embeddingLength: c.embedding?.length,
        fullEmbedding: c.embedding,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;