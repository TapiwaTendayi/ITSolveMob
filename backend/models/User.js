import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true },
    email:    { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["office", "student", "supervisor"],
      required: true,
    },
    office: { type: String }, // Office name or department

    // ── Soft-delete fields ─────────────────────────────────────────────────
    // Instead of removing the document (which breaks all FK references),
    // we set isDeleted=true and record when it happened.
    isDeleted:  { type: Boolean, default: false },
    deletedAt:  { type: Date,    default: null  },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
export default User;
