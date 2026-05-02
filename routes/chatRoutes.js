import express from "express";
import Document from "../models/DocumentChunk.js";
import { generateEmbedding } from "../services/embeddingService.js";
import { generateChatResponse } from "../services/chatServices.js";
import { cosineSimilarity } from "../utils/cosineSimilarity.js";
import {
  cacheGet, cachePut, getCacheStats, clearCache,
} from "../services/lfuCache.js";
import {
  callGroqWithRetry, safeParseJSON, GROQ_TEXT_MODEL,
} from "../services/groqVisionService.js";

const router = express.Router();
function renderChunkForContext(r) {
  const typeLabel =
    r.type === "table" ? "TABLE DATA" :
      r.type === "image" ? "IMAGE DESCRIPTION" : "TEXT";

  if (r.type === "table" && r.tableMetadata && r.tableMetadata.headers && r.tableMetadata.headers.length > 0) {
    const { tableName, headers, totalRows, chunkRowStart, chunkRowEnd } = r.tableMetadata;
    const rowRange = (chunkRowStart && chunkRowEnd)
      ? ` | Rows ${chunkRowStart}–${chunkRowEnd} of ${totalRows || "?"}`
      : "";
    const hasStructured = r.content && r.content.startsWith("Table:");
    const body = hasStructured
      ? r.content
      : [
        `Table: ${tableName || "Unknown"}`,
        "",
        "Columns:",
        headers.join(" | "),
        "",
        "Records:",
        ...(r.content || "").split("\n").filter(l => l.trim().length > 0),
      ].join("\n");
    return `[${typeLabel}]${rowRange}\n${body}`;
  }

  return `[${typeLabel}] Section: ${r.section} | File: ${r.filename}\n${r.content}`;
}

function contentOverlap(a, b) {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  let common = 0;
  for (const w of wordsA) if (wordsB.has(w)) common++;
  const smaller = Math.min(wordsA.size, wordsB.size);
  return smaller === 0 ? 0 : common / smaller;
}

function deduplicateByContent(chunks, threshold = 0.60) {
  const unique = [];
  for (const chunk of chunks) {
    if (chunk.type === "table") {
      unique.push(chunk);
      continue;
    }
    const isDup = unique.some(
      (u) =>
        // Cross-document dedup enabled (removed filename === check)
        u.type !== "table" &&
        contentOverlap(u.content, chunk.content) >= threshold
    );
    if (!isDup) unique.push(chunk);
  }
  return unique;
}

const STOP_WORDS = new Set([
  "what", "is", "are", "the", "a", "an", "of", "in", "on", "at", "to", "for",
  "how", "many", "does", "do", "when", "where", "which", "who", "why", "was",
  "were", "will", "can", "could", "should", "would", "tell", "me", "about",
  "give", "list", "explain", "describe", "find", "show", "please", "and", "or",
  "but", "not", "all", "every", "each", "its", "it", "this", "that", "with",
  "from", "by", "has", "have", "had",
]); //can be used for keyword boosting and keyword fall back search 

function extractKeywords(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

//paraphrasing
async function expandQuery(question) {
  try {
    const response = await callGroqWithRetry({
      model: GROQ_TEXT_MODEL,
      messages: [
        {
          role: "system",
          content:
            `You generate search query alternatives for a document retrieval system. ` +
            `Given a question, return ONLY a JSON array of 2 alternative phrasings that:\n` +
            `- Rephrase the question with different word order or structure\n` +
            `- Use synonyms for key terms (e.g. "allowance" → "entitlement", "limit", "amount")\n` +
            `- Convert question form to keyword form (e.g. "what is the X?" → "X policy details")\n` +
            `- Keep the same meaning and intent\n` +
            `Return ONLY a JSON array: ["phrase1", "phrase2"]. No explanation, no markdown.`,
        },
        { role: "user", content: `Question: "${question}"` },
      ],
      temperature: 0.4,
      max_tokens: 150,
    });
    if (!response) return [question];
    const data = await response.json();
    const raw = (data.choices?.[0]?.message?.content || "[]").trim();
    const parsed = safeParseJSON(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return [question, ...parsed.slice(0, 2)];
    }
  } catch (_) {
  }
  return [question];
}


router.post("/chat", async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ message: "Question is required" });

    const cached = cacheGet(question);
    if (cached) {
      return res.json({
        answer: cached.answer,
        sources: cached.sources,
        multiDoc: cached.multiDoc,
        fromCache: true,
      });
    }
    const [queryVariants, allDocs] = await Promise.all([
      expandQuery(question),
      Document.find({}, { content: 1, filename: 1, section: 1, embedding: 1, type: 1, tableMetadata: 1 }),
    ]);

    if (!allDocs.length) return res.json({ answer: "No documents uploaded yet." });

    const keywords = extractKeywords(question);
    console.log(`🔍 Query expansion: ${queryVariants.length} variant(s) — "${queryVariants.join('" | "')}"`);
    const allQueryEmbeddings = await Promise.all(queryVariants.map((q) => generateEmbedding(q)));


    const scored = allDocs.map((doc) => {
      const similarities = allQueryEmbeddings.map((emb) => cosineSimilarity(emb, doc.embedding));
      const baseSimilarity = Math.max(...similarities);
      const docType = doc.type || "text";

      const sectionLower = (doc.section || "").toLowerCase();
      const sectionBoost = keywords.some((kw) => sectionLower.includes(kw)) ? 0.08 : 0;

      const contentLower = (doc.content || "").toLowerCase();
      const keywordHits = keywords.filter((kw) => contentLower.includes(kw)).length;
      const headerHits = docType === "table" && doc.tableMetadata?.headers
        ? keywords.filter((kw) => doc.tableMetadata.headers.some((h) => h.toLowerCase().includes(kw))).length
        : 0;
      const keywordBoostPerHit = docType === "table" ? 0.07 : 0.04;
      const keywordBoost = Math.min((keywordHits + headerHits) * keywordBoostPerHit, 0.25);

      return {
        content: doc.content,
        filename: doc.filename,
        section: doc.section || "General",
        type: docType,
        score: baseSimilarity + sectionBoost + keywordBoost,
        embedding: doc.embedding,
        tableMetadata: doc.tableMetadata || null,
      };
    });

    const TEXT_THRESHOLD = 0.35;
    const TABLE_THRESHOLD = 0.20;
    let topResults = scored
      .sort((a, b) => b.score - a.score)
      .filter((r) => r.score >= (r.type === "table" ? TABLE_THRESHOLD : TEXT_THRESHOLD));

    if (topResults.length === 0 && keywords.length > 0) {
      console.log("⚠️ No semantic matches — falling back to keyword search");
      topResults = scored
        .filter((r) => keywords.some((kw) => (r.content || "").toLowerCase().includes(kw)))
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);
    }

    if (topResults.length === 0) {
      return res.json({ answer: "No relevant information found in uploaded documents." });
    }

    topResults = deduplicateByContent(topResults, 0.60).slice(0, 15);
    topResults = topResults.filter(r => r.filename && r.filename !== "undefined");

    const byFile = {};
    for (const r of topResults) {
      if (!byFile[r.filename]) byFile[r.filename] = [];
      byFile[r.filename].push(r);
    }

    const overallTopScore = topResults[0]?.score || 0;
    const minFileScore = overallTopScore * 0.85;
    const relevantFiles = {};
    for (const [fname, chunks] of Object.entries(byFile)) {
      const bestScore = Math.max(...chunks.map(c => c.score));
      if (bestScore >= minFileScore) {
        relevantFiles[fname] = chunks;
      }
    }
    const fileNames = Object.keys(relevantFiles).filter(f => f && f !== "undefined");
    const multiDoc = fileNames.length > 1;
    topResults = topResults.filter(r => relevantFiles[r.filename]);

    let context = "";
    if (multiDoc) {
      context = fileNames
        .map((fname, idx) => {
          const chunks = relevantFiles[fname];
          const chunkText = chunks
            .map((r) => `  ${renderChunkForContext(r)}`)
            .join("\n\n");
          return `=== DOCUMENT ${idx + 1}: ${fname} ===\n${chunkText}`;
        })
        .join("\n\n");
    } else {
      context = topResults
        .map((r) => renderChunkForContext(r))
        .join("\n\n---\n\n");
    }

    console.log(`Retrieval: ${topResults.length} chunks from ${fileNames.length} document(s)`);
    topResults.forEach((r, i) =>
      console.log(`  [${i + 1}] score=${r.score.toFixed(3)} file="${r.filename}" section="${r.section}" type=${r.type}`)
    );

    const answer = await generateChatResponse(context, question, multiDoc);

    cachePut(question, answer, fileNames, multiDoc);

    res.json({
      answer,
      sources: fileNames,
      sections: [...new Set(topResults.map((r) => r.section))],
      multiDoc,
      fromCache: false,
    });
  } catch (error) {
    console.error("Chat Error:", error);
    res.status(500).json({ message: "Chat failed" });
  }
});


router.get("/cache/stats", (req, res) => {
  res.json(getCacheStats(50));
});

router.post("/cache/clear", async (req, res) => {
  await clearCache();
  res.json({ message: "Cache cleared successfully" });
});

export default router;