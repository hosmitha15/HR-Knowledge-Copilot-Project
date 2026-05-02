//define shape of a user document in the schema
import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
  role: { type: String, enum: ["HR", "USER"] }
});

export default mongoose.model("User", userSchema);
