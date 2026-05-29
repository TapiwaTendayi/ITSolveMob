// backend/models/Request.js
import mongoose from "mongoose";

const RequestSchema = new mongoose.Schema(
  {
    title: { type: String, required: false, default: "" },
    description: { type: String, required: true },

    // who created the request (Office user)
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // ── Snapshot: copied at creation time, survives user deletion ──────────
    requestedBySnapshot: {
      name:   { type: String, default: "" },
      office: { type: String, default: "" },
      email:  { type: String, default: "" },
    },

    // supervisor who assigned
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // student assigned to handle the request
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // ── Snapshot: copied at assignment time, survives user deletion ─────────
    assignedToSnapshot: {
      name:  { type: String, default: "" },
      email: { type: String, default: "" },
    },

    // single global status (office resolves -> becomes "resolved")
    status: {
      type: String,
      enum: ["pending", "resolved"],
      default: "pending",
    },

    // resolved info (set when an office user resolves)
    resolvedAt: { type: Date, default: null },
    resolvedByOffice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Troubleshooting conversation (from AI modal)
    troubleshooting: {
      type: String,
      default: ''
    },

    troubleshootingCompleted: {
      type: Boolean,
      default: false
    },

    aiSuggestedCategory: {
      type: String,
      default: ''
    },

    // AI Troubleshooting suggestions
    aiSuggestions: {
      type: String,
      default: null
    },

    aiSuggestionSource: {
      type: String,
      enum: ["ai_generated", "cached", "rule_based", "escalated", null],
      default: null
    },

    // Supervisor response to office user
    supervisorResponse: {
      type: String,
      default: ''
    },

    // When supervisor responded
    supervisorRespondedAt: {
      type: Date,
      default: null
    },

    lastMessage: {
      content: { type: String, default: "" },
      sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      senderRole: { type: String },
      timestamp: { type: Date, default: Date.now }
    },

    // Store troubleshooting steps for this specific request
    troubleshootingSteps: {
      type: {
        steps: [String],
        source: {
          type: String,
          enum: ['ai_generated', 'cached', 'rule_based', 'fallback', 'escalation', 'non_it', 'gibberish', null],
          default: null
        },
        aiUsed: { type: Boolean, default: false },
        generatedAt: { type: Date, default: null },
        category: {
          type: String,
          enum: ['ai_generated', 'cached', 'rule_based', 'fallback', 'escalation', 'non_it', 'gibberish', null],
          default: null
        }
      },
      default: null
    },
    completedSteps: { type: [Number], default: [] },
    stepsUpdatedAt: { type: Date, default: null }
  },

  { timestamps: true }
);

// Method to check if request is resolved
RequestSchema.methods.isResolved = function() {
  return this.status === 'resolved' || this.resolvedAt !== null;
};

export default mongoose.model("Request", RequestSchema);