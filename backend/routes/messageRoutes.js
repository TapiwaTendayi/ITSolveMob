// backend/routes/messageRoutes.js
// Routes only — all business logic lives in messageController.js
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getMessages,
  createMessage,
  getUnreadCounts,
  markMessagesRead,
  getUnreadCountForRequest,
} from "../controllers/messageController.js";

const router = express.Router();

router.get("/unread/counts", protect, getUnreadCounts);
router.post("/mark-read/:requestId", protect, markMessagesRead);
router.get("/unread/:requestId", protect, getUnreadCountForRequest);
router.get("/:requestId", protect, getMessages);
router.post("/", protect, createMessage);

export default router;
