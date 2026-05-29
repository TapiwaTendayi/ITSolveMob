// backend/routes/notificationRoutes.js
// Routes only — all business logic lives in notificationController.js
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  markNotificationsRead,
  markOneNotificationRead,
  markAllNotificationsRead,
  getUnreadCount,
} from "../controllers/notificationController.js";

const router = express.Router();

router.post("/mark-read", protect, markNotificationsRead);
router.put("/mark-all-read", protect, markAllNotificationsRead);
router.put("/:notificationId/read", protect, markOneNotificationRead);
router.get("/unread-count", protect, getUnreadCount);

export default router;
