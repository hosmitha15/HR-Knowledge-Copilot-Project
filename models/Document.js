import mongoose from "mongoose";

const DocumentSchema = new mongoose.Schema({
  filename: String,
  filepath: String,
  uploadedAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model("Document", DocumentSchema);
