import express from "express";
import Document from "../models/DocumentChunk.js";
import { generateEmbedding } from "../services/embeddingService.js";
import { generateChatResponse } from "../services/chatServices.js";
import { cosineSimilarity } from "../utils/cosineSimilarity.js";
import {
  cacheGet, cachePut, getCacheStats, clearCache,
} from "../services/lfuCache.js";

const router = express.Router();

function contentOverlap(a, b) {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  let common = 0;
  for (const w of wordsA) if (wordsB.has(w)) common++;
  const smaller = Math.min(wordsA.size, wordsB.size);
  return smaller === 0 ? 0 : common / smaller;
}

function deduplicateByContent(chunks, threshold = 0.80) {
  const unique = [];
  for (const chunk of chunks) {
    if (chunk.type === "table") {
      unique.push(chunk);
      continue;
    }
    const isDup = unique.some(
      (u) =>
        u.filename === chunk.filename &&
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
]);

function extractKeywords(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
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

    const queryEmbedding = await generateEmbedding(question);

    const allDocs = await Document.find(
      {},
      { content: 1, filename: 1, section: 1, embedding: 1, type: 1 }
    );

    if (!allDocs.length) return res.json({ answer: "No documents uploaded yet." });

    const keywords = extractKeywords(question);

    const scored = allDocs.map((doc) => {
      const baseSimilarity = cosineSimilarity(queryEmbedding, doc.embedding);
      const docType = doc.type || "text";

      const sectionLower = (doc.section || "").toLowerCase();
      const sectionBoost = keywords.some((kw) => sectionLower.includes(kw)) ? 0.08 : 0;

      const contentLower = (doc.content || "").toLowerCase();
      const keywordHits = keywords.filter((kw) => contentLower.includes(kw)).length;
      const keywordBoostPerHit = docType === "table" ? 0.07 : 0.04;
      const keywordBoost = Math.min(keywordHits * keywordBoostPerHit, 0.20);

      return {
        content: doc.content,
        filename: doc.filename,
        section: doc.section || "General",
        type: docType,
        score: baseSimilarity + sectionBoost + keywordBoost,
        embedding: doc.embedding,
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

    topResults = deduplicateByContent(topResults, 0.70).slice(0, 15);

    const byFile = {};
    for (const r of topResults) {
      if (!byFile[r.filename]) byFile[r.filename] = [];
      byFile[r.filename].push(r);
    }

    const overallTopScore = topResults[0]?.score || 0;
    const minFileScore = overallTopScore * 0.60; 
    const relevantFiles = {};
    for (const [fname, chunks] of Object.entries(byFile)) {
      const bestScore = Math.max(...chunks.map(c => c.score));
      if (bestScore >= minFileScore) {
        relevantFiles[fname] = chunks;
      }
    }
    const fileNames = Object.keys(relevantFiles);
    const multiDoc = fileNames.length > 1;
    topResults = topResults.filter(r => relevantFiles[r.filename]);

    let context = "";
    if (multiDoc) {
      context = fileNames
        .map((fname, idx) => {
          const chunks = relevantFiles[fname];
          const chunkText = chunks
            .map((r) => {
              const typeLabel =
                r.type === "table" ? "TABLE DATA" :
                  r.type === "image" ? "IMAGE DESCRIPTION" : "TEXT";
              return `  [${typeLabel}] Section: ${r.section}\n  ${r.content}`;
            })
            .join("\n\n");
          return `=== DOCUMENT ${idx + 1}: ${fname} ===\n${chunkText}`;
        })
        .join("\n\n");
    } else {
      context = topResults
        .map((r) => {
          const typeLabel =
            r.type === "table" ? "TABLE DATA" :
              r.type === "image" ? "IMAGE DESCRIPTION" : "TEXT";
          return `[${typeLabel}] Section: ${r.section} | File: ${r.filename}\n${r.content}`;
        })
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