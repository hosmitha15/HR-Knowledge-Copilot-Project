import mongoose from "mongoose";

const cacheEntrySchema = new mongoose.Schema({
    normalizedQuestion: { type: String, required: true, unique: true },
    originalQuestion: { type: String, required: true },
    answer: { type: String, required: true },
    sources: [String],
    multiDoc: { type: Boolean, default: false },
    frequency: { type: Number, default: 1 },
    lastAskedAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
});

cacheEntrySchema.index({ frequency: -1 });

export default mongoose.model("CacheEntry", cacheEntrySchema);
