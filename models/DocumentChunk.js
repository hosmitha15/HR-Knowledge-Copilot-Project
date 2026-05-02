import mongoose from "mongoose";

const documentChunkSchema = new mongoose.Schema({
  filename: String,
  filepath: String,
  type: {
    type: String,
    enum: ["text", "table", "image"],
    default: "text",
  },
  content: String,
  embedding: [Number],
  section: { type: String, default: "General" },
  tableMetadata: {
    tableName: String,
    headers: [String],
    totalRows: Number,
    chunkRowStart: Number,
    chunkRowEnd: Number,
  },
  metadata: {
    page: Number,
    position: Number,
  },
});

const Document = mongoose.model("DocumentChunk", documentChunkSchema);

export default Document;