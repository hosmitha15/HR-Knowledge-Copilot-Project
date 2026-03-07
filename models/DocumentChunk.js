import mongoose from "mongoose";

const documentChunkSchema = new mongoose.Schema({
  filename: String,
  filepath: String,
  type: {
    type: String,
    enum: ["text", "table", "image"],
    default: "text"
  },
  content: String,
  embedding: [Number],
  metadata: {
    page: Number,
    position: Number
  },
  section: String,
  chunkIndex: Number,
  // Structured metadata for table chunks (hybrid structured chunking)
  tableMetadata: {
    tableName: String,      // e.g. "Leave Policy"
    headers: [String],      // ["Leave Type", "Days", "Eligibility"]
    totalRows: Number,      // total data rows in the source table
    chunkRowStart: Number,  // 1-based index of first row in this chunk
    chunkRowEnd: Number     // 1-based index of last row in this chunk
  }
});

const Document = mongoose.model("DocumentChunk", documentChunkSchema);

export default Document;