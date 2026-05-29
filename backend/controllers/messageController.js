// backend/controllers/messageController.js
import Message from "../models/Message.js";
import Request from "../models/Request.js";
import User from "../models/User.js";

// GET /messages/:requestId — fetch all messages for a request
export const getMessages = async (req, res) => {
  try {
    const messages = await Message.find({ requestId: req.params.requestId })
      .populate("sender", "name role")
      .sort({ createdAt: 1 });

    const formattedMessages = messages.map(msg => ({
      _id: msg._id,
      content: msg.content,
      sender: msg.sender._id,
      senderName: msg.sender.name,
      senderRole: msg.sender.role,
      createdAt: msg.createdAt,
      readBy: msg.readBy || [],
      isRead: msg.readBy ? msg.readBy.includes(req.user.id) : false,
      status: msg.status || "sent"
    }));

    res.json(formattedMessages);
  } catch (err) {
    console.error("Error fetching messages:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// POST /messages — create message (HTTP fallback; socket is primary)
export const createMessage = async (req, res) => {
  try {
    const { requestId, content } = req.body;

    const request = await Request.findById(requestId);
    if (!request) return res.status(404).json({ message: "Request not found" });

    const isOffice = request.requestedBy.toString() === req.user.id;
    const isSupervisor = req.user.role === "supervisor";
    const isAssignedStudent = request.assignedTo?.toString() === req.user.id;

    if (!isOffice && !isSupervisor && !isAssignedStudent) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const message = await Message.create({
      requestId,
      sender: req.user.id,
      senderRole: req.user.role,
      content,
      status: "sent",
      readBy: [req.user.id]
    });

    await Request.findByIdAndUpdate(requestId, {
      lastMessage: { content, sender: req.user.id, senderRole: req.user.role, timestamp: new Date() }
    });

    const populatedMessage = await Message.findById(message._id).populate("sender", "name role");

    const formattedMessage = {
      _id: populatedMessage._id,
      content: populatedMessage.content,
      sender: populatedMessage.sender._id,
      senderName: populatedMessage.sender.name,
      senderRole: populatedMessage.sender.role,
      createdAt: populatedMessage.createdAt,
      readBy: populatedMessage.readBy,
      status: "sent",
      isRead: true
    };

    const io = req.app.get("io");
    const connectedUsers = req.app.get("connectedUsers");

    const recipients = [];
    if (request.requestedBy.toString() !== req.user.id) recipients.push(request.requestedBy.toString());
    if (request.assignedTo && request.assignedTo.toString() !== req.user.id) recipients.push(request.assignedTo.toString());

    if (req.user.role === "office") {
      const supervisors = await User.find({ role: "supervisor" }).select("_id");
      supervisors.forEach(s => {
        if (s._id.toString() !== req.user.id) recipients.push(s._id.toString());
      });
    }

    [...new Set(recipients)].forEach(recipientId => {
      const recipientSockets = connectedUsers.get(recipientId);
      if (recipientSockets) {
        for (let [socketId] of recipientSockets.entries()) {
          io.to(socketId).emit("new-message", { requestId, message: formattedMessage });
        }
      }
    });

    res.status(201).json(formattedMessage);
  } catch (err) {
    console.error("Error creating message:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /messages/unread/counts — unread message counts per request
export const getUnreadCounts = async (req, res) => {
  try {
    let userRequests;
    if (req.user.role === "supervisor") {
      userRequests = await Request.find({}).select("_id");
    } else {
      userRequests = await Request.find({
        $or: [{ requestedBy: req.user.id }, { assignedTo: req.user.id }]
      }).select("_id");
    }

    const requestIds = userRequests.map(r => r._id);
    const unreadCounts = await Message.aggregate([
      { $match: { requestId: { $in: requestIds }, sender: { $ne: req.user.id }, readBy: { $ne: req.user.id } } },
      { $group: { _id: "$requestId", count: { $sum: 1 } } }
    ]);

    const result = {};
    unreadCounts.forEach(item => { result[item._id.toString()] = item.count; });

    res.json(result);
  } catch (err) {
    console.error("Error getting unread counts:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// POST /messages/mark-read/:requestId — mark messages as read
export const markMessagesRead = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.id;

    const unreadMessages = await Message.find({
      requestId,
      sender: { $ne: userId },
      readBy: { $ne: userId }
    }).select("_id sender");

    if (unreadMessages.length === 0) {
      return res.json({ success: true, count: 0, messageIds: [] });
    }

    const messageIds = unreadMessages.map(m => m._id);
    const uniqueSenders = [...new Set(unreadMessages.map(m => m.sender.toString()))];

    const result = await Message.updateMany(
      { _id: { $in: messageIds }, readBy: { $ne: userId } },
      { $addToSet: { readBy: userId }, status: "read" }
    );

    const io = req.app.get("io");
    const connectedUsers = req.app.get("connectedUsers");

    for (const senderId of uniqueSenders) {
      const senderSockets = connectedUsers.get(senderId);
      if (senderSockets) {
        for (let [socketId] of senderSockets.entries()) {
          io.to(socketId).emit("messages-read", {
            requestId,
            userId,
            messageIds: messageIds.map(id => id.toString())
          });
        }
      }
    }

    res.json({ success: true, count: result.modifiedCount, messageIds: messageIds.map(id => id.toString()) });
  } catch (err) {
    console.error("Error marking messages as read:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /messages/unread/:requestId — unread count for one request
export const getUnreadCountForRequest = async (req, res) => {
  try {
    const count = await Message.countDocuments({
      requestId: req.params.requestId,
      sender: { $ne: req.user.id },
      readBy: { $ne: req.user.id }
    });
    res.json({ unreadCount: count });
  } catch (err) {
    console.error("Error getting unread count:", err);
    res.status(500).json({ message: "Server error" });
  }
};
