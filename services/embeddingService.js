import { pipeline } from "@xenova/transformers";
let extractor = null;
export const generateEmbedding = async (text) => {
  if (!extractor) {
    console.log(" Loading embedding model...");
    extractor = await pipeline("feature-extraction","Xenova/all-MiniLM-L6-v2");
    console.log(" Embedding model loaded");
  }
  const output = await extractor(text,{ pooling: "mean", normalize: true });
  return Array.from(output.data);
};