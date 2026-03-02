import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import { warmCache } from "./services/lfuCache.js";
const app = express();
if (!process.env.MONGO_URI) {
  console.error("MONGO_URI missing in .env");
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY missing in .env");
  process.exit(1);
}
const PORT = process.env.PORT || 5000;
// DATABASE
connectDB().then(() => {
  // Warm LFU cache from MongoDB after DB is connected
  warmCache();
});
// MIDDLEWARE
app.use(cors());
app.use(express.json());
// ROUTES
app.use("/api", uploadRoutes);
app.use("/api", chatRoutes);
app.use("/api/auth", authRoutes);
app.get("/", (req, res) => {
  res.send("✅ HR Knowledge Copilot Server Running");
});
// SERVER
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});