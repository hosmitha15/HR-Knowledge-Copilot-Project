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

const PORT = process.env.PORT || 6000;

connectDB().then(() => {
  warmCache();
});

app.use(cors());
app.use(express.json());


app.use("/api", uploadRoutes);
app.use("/api", chatRoutes);
app.use("/api/auth", authRoutes);
app.get("/", (req, res) => {
  res.send("✅ HR Knowledge Copilot Server Running");
});


app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});