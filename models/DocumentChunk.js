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
  chunkIndex: Number
});

const Document = mongoose.model("DocumentChunk", documentChunkSchema);

export default Document;