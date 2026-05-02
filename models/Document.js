// tracks every file that HR uploads
import mongoose from "mongoose";

const CATEGORIES = ["Policies", "Benefits", "Compliance", "Onboarding", "Training", "Other"];

const DocumentSchema = new mongoose.Schema({
  filename: String,
  filepath: String,
  category: {
    type: String,
    enum: CATEGORIES,
    default: "Policies",
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("Document", DocumentSchema);
