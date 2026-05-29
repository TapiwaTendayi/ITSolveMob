// backend/controllers/notificationController.js
import Notification from "../models/Notification.js";

// POST /notifications/mark-read — mark specific notifications as read
export const markNotificationsRead = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "Notification IDs are required" });
    }
    await Notification.updateMany(
      { _id: { $in: ids }, userId: req.user.id },
      { read: true }
    );
    res.json({ success: true, markedCount: ids.length });
  } catch (err) {
    console.error("Error marking notifications as read:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// PUT /notifications/:notificationId/read — mark single notification as read
export const markOneNotificationRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.notificationId, userId: req.user.id },
      { read: true },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: "Notification not found" });
    res.json({ success: true, notification });
  } catch (err) {
    console.error("Error marking notification as read:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// PUT /notifications/mark-all-read — mark all notifications as read
export const markAllNotificationsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user.id, read: false },
      { read: true }
    );
    res.json({ success: true, message: "All notifications marked as read" });
  } catch (err) {
    console.error("Error marking all notifications as read:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /notifications/unread-count — count of unread notifications
export const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({ userId: req.user.id, read: false });
    res.json({ unreadCount: count });
  } catch (err) {
    console.error("Error getting unread count:", err);
    res.status(500).json({ message: "Server error" });
  }
};
