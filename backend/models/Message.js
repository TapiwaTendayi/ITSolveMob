import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  requestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Request",
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  senderRole: {
    type: String,
    enum: ["office", "supervisor", "student"],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ["sending", "sent", "delivered", "read", "failed"],
    default: "sent"
  },
  readBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for faster queries
messageSchema.index({ requestId: 1, createdAt: 1 });
messageSchema.index({ readBy: 1 });

export default mongoose.model("Message", messageSchema);