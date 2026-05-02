// converts any raw text into 384-number vector that captures its semantic meaning
import { pipeline } from "@xenova/transformers"; //js port of hugging face transformers
let extractor = null;
export const generateEmbedding = async (text) => {
  // Lazy initialiation
  if (!extractor) {
    console.log(" Loading embedding model...");
    extractor = await pipeline("feature-extraction","Xenova/all-MiniLM-L6-v2");
    console.log(" Embedding model loaded");
  }
  const output = await extractor(text,{ pooling: "mean", normalize: true });
  return Array.from(output.data);
};