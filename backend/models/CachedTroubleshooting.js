// backend/models/CachedTroubleshooting.js
import mongoose from "mongoose";

const cachedTroubleshootingSchema = new mongoose.Schema({
  normalizedIssue: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Pre-computed stemmed keywords stored at save time.
  // Used by the three-gate semantic cache matcher to avoid
  // re-tokenizing every entry on every lookup.
  keywords: {
    type: [String],
    default: []
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  steps: [{
    id: Number,
    question: String,
    answer: String,
    completed: {
      type: Boolean,
      default: false
    }
  }],
  usageCount: {
    type: Number,
    default: 1
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp on save
cachedTroubleshootingSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model("CachedTroubleshooting", cachedTroubleshootingSchema);