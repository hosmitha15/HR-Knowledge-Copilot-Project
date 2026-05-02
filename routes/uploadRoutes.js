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
import { extractStructuredFromImage, extractTablesFromText, extractFactsFromImage } from "../services/groqVisionService.js";
import { extractPageImagesFromPDF } from "../services/pdfImageExtractor.js";
import { clearCache, clearCacheForFile } from "../services/lfuCache.js";

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

function inferTableName(filename, sheetName) {
  if (sheetName && sheetName.toLowerCase() !== "sheet1") {
    return sheetName.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
  }
  const base = filename
    .replace(/^\d+-/, "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
  return base || "Table";
}


function buildEmbeddingText(headers, dataRows, tableName) {
  const facts = [];
  facts.push(`Table "${tableName || "data"}" columns: ${headers.join(", ")}.`);
  for (const row of dataRows) {
    const cells = row.split("|").map((c) => c.trim());
    const pairs = headers
      .map((h, i) => {
        const v = cells[i];
        return v && v.length > 0 ? `${h}: ${v}` : null;
      })
      .filter(Boolean);

    if (pairs.length > 0) {
      facts.push(`In ${tableName || "this table"}, ${pairs.join(", ")}.`);
    }
  }

  return facts.join("\n");
}

function buildStructuredContent(tableName, headers, dataRows) {
  return [
    `Table: ${tableName}`,
    "",
    "Columns:",
    headers.join(" | "),
    "",
    "Records:",
    ...dataRows,
  ].join("\n");
}


async function storeTableChunks(blocks, filename, sheetName = "") {
  const ROWS_PER_CHUNK = 5;
  const sectionName = "TABLE";

  for (const block of blocks) {
    if (!block || block.trim().length < 10) continue;

    const rows = block.split("\n").filter((r) => r.trim().length > 0);
    if (rows.length < 2) continue;

    const headerRow = rows[0];
    const headers = headerRow.split("|").map((c) => c.trim()).filter(Boolean);
    if (headers.length === 0) continue;

    const dataRows = rows.slice(1).filter((r) => r.trim().length > 0);
    if (dataRows.length === 0) continue;

    const tableName = inferTableName(filename, sheetName);
    const totalRows = dataRows.length;
    let chunksCreated = 0;

    for (let i = 0; i < dataRows.length; i += ROWS_PER_CHUNK) {
      const batchRows = dataRows.slice(i, i + ROWS_PER_CHUNK);
      const chunkRowStart = i + 1;
      const chunkRowEnd = i + batchRows.length;

      const content = buildStructuredContent(tableName, headers, batchRows);

      const embeddingText = buildEmbeddingText(headers, batchRows, tableName);

      const embedding = await generateEmbedding(embeddingText);
      if (!embedding || embedding.length === 0) continue;

      await DocumentChunk.create({
        filename,
        type: "table",
        content,
        embedding,
        section: sectionName,
        tableMetadata: {
          tableName,
          headers,
          totalRows,
          chunkRowStart,
          chunkRowEnd,
        },
      });
      chunksCreated++;
    }

    console.log(
      `  📊 Table "${tableName}": ${totalRows} rows → ${chunksCreated} structured chunks (${ROWS_PER_CHUNK} rows/chunk) for "${filename}"`
    );
  }
}

async function storeOtherChunks(blocks, filename, type) {
  // For image chunks only — table path now uses storeTableChunks
  const sectionName = "IMAGE";
  const chunkSize = 1500;
  const overlap = 200;
  for (const block of blocks) {
    if (!block || block.trim().length < 10) continue;
    for (let i = 0; i < block.length; i += chunkSize - overlap) {
      const chunk = block.slice(i, i + chunkSize);
      const embedding = await generateEmbedding(chunk);
      if (!embedding || embedding.length === 0) continue;
      await DocumentChunk.create({ filename, type, content: chunk, embedding, section: sectionName });
    }
  }
}

// ──────────────────────────────────────────────────────────────
// Auto-category inference: runs on filename + first 600 chars
// of extracted text. No API call needed — pure keyword matching.
// ──────────────────────────────────────────────────────────────
const CATEGORY_KEYWORDS = {
  Benefits: ["benefit", "benefits", "insurance", "health", "dental", "vision",
    "retirement", "401k", "provident", "pf", "compensation", "salary",
    "pay", "allowance", "perks", "wellness", "medical", "reimbursement"],
  Compliance: ["compliance", "legal", "gdpr", "hipaa", "regulatory", "audit",
    "risk", "ethics", "anti-bribery", "data protection", "security",
    "confidentiality", "privacy", "nda"],
  Onboarding: ["onboarding", "onboard", "induction", "welcome", "new hire",
    "new employee", "orientation", "joining", "probation"],
  Training: ["training", "learning", "development", "course", "certification",
    "skill", "workshop", "e-learning", "upskilling", "mentoring"],
  Policies: ["policy", "policies", "handbook", "code of conduct", "rules",
    "guidelines", "procedures", "leave", "attendance", "dress code",
    "wfh", "work from home", "appraisal", "performance"],
};

function inferCategory(filename, textSample = "") {
  const haystack = (filename + " " + textSample).toLowerCase();
  const scores = {};
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    scores[cat] = keywords.filter(kw => haystack.includes(kw)).length;
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  // If no keyword matched at all, fall back to Policies
  return best[1] > 0 ? best[0] : "Policies";
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
      // Process each sheet directly with storeTableChunks to preserve sheet names
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        const tableText = rows
          .filter((r) => r.some((c) => c !== null && c !== undefined && c !== ""))
          .map((row) => row.join(" | "))
          .join("\n");
        // Store each sheet immediately with its own name for accurate table naming
        if (tableText.trim().length > 10) {
          await storeTableChunks([tableText], filename, sheetName);
        }
      }
      // Mark as handled so we skip the generic table store at the bottom
      extractedTables = []; // already stored above

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

            // Semantic fact extraction + general vision in parallel
            const [pageFacts, visionResult] = await Promise.all([
              extractFactsFromImage(buffer, "image/png"),
              extractStructuredFromImage(buffer, "image/png"),
            ]);

            // Facts are natural language sentences → stored as text chunks (embed perfectly)
            if (pageFacts.length > 0) {
              pageFacts.forEach(f => extractedTextBlocks.push(`[PDF page ${pageNum}]: ${f}`));
              console.log(`📊 Page ${pageNum}: ${pageFacts.length} semantic facts extracted`);
            }

            const rawTexts = (visionResult.textBlocks || []).filter(t => t?.trim().length > 5);
            if (rawTexts.length > 0) {
              extractedTextBlocks.push(`[PDF page ${pageNum}]: ${rawTexts.join(" | ")}`);
            }

            const descriptions = (visionResult.imageDescriptions || []).map(
              (d) => `[Image page ${pageNum}]: ${d}`
            );
            if (descriptions.length > 0) {
              extractedImages.push(...descriptions);
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
      console.log("🖼 Processing image with Groq Vision (facts + structured extraction)...");

      const [imageFacts, visionResult] = await Promise.all([
        extractFactsFromImage(fileBuffer, mimetype),
        extractStructuredFromImage(fileBuffer, mimetype),
      ]);

      if (imageFacts.length > 0) {
        extractedTextBlocks.push(...imageFacts);
        console.log(`  → ${imageFacts.length} semantic fact(s) stored as text chunks`);
      }

      const imageTables = (visionResult.tables || []).filter((t) => t?.trim().length > 10);
      if (imageTables.length > 0) {
        extractedTables.push(...imageTables);
        console.log(`  → ${imageTables.length} structured table(s) from image queued for table chunks`);
      }

      extractedTextBlocks.push(...(visionResult.textBlocks || []));
      extractedImages.push(...(visionResult.imageDescriptions || []));

    } else {
      return res.status(400).json({ message: "Unsupported file type" });
    }

    console.log(` Extraction complete → text:${extractedTextBlocks.length} tables:${extractedTables.length} images:${extractedImages.length}`);

    // Use the category selected by HR in the dropdown; fall back to "Policies"
    const category = req.body.category || "Policies";
    console.log(`📂 Category: "${category}" for "${filename}"`);

    await storeChunksWithSections(extractedTextBlocks, filename);
    await storeTableChunks(extractedTables, filename);
    await storeOtherChunks(extractedImages, filename, "image");
    await Document.create({ filename, filepath: path.resolve(filepath), category, uploadedAt: new Date() });
    // Evict only cached Q&As that referenced this filename (smart invalidation)
    await clearCacheForFile(filename);
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
    // doc.filepath is stored as an absolute path (via path.resolve at upload time)
    const fullPath = doc.filepath;
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    await Document.deleteOne({ _id: req.params.id });
    await DocumentChunk.deleteMany({ filename: doc.filename });
    await clearCacheForFile(doc.filename);
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