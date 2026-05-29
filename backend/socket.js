// backend/socket.js
import Message from "./models/Message.js";
import Request from "./models/Request.js";
import Notification from "./models/Notification.js";
 
export default function setupSocketHandlers(io, connectedUsers) {
  // ─── Per-socket registration guard ───────────────────────────────────────
  // Prevents a client that reconnects rapidly (bad internet) from firing the
  // full DB bootstrap on every reconnect attempt.  We only re-run it when the
  // userId actually changes for this socket, or if it's a brand-new socket.
  const registrationInProgress = new Set(); // socketIds currently being registered
 
  io.on("connection", (socket) => {
    console.log(`🔌 New client connected: ${socket.id} at ${new Date().toISOString()}`);
 
    let currentUserId = null;
    let currentUserRole = null;
 
    // ── Register ─────────────────────────────────────────────────────────────
    socket.on("register", async (userId, role, callback) => {
      // De-duplicate: if this socket is already mid-registration for the same
      // user, skip the second call (happens during flaky reconnects).
      if (registrationInProgress.has(socket.id)) {
        console.log(`⚠️  Duplicate register ignored for socket ${socket.id}`);
        if (typeof callback === "function") callback({ success: true, deduplicated: true });
        return;
      }
 
      // If this socket already registered as the same user, just re-join rooms.
      if (currentUserId === userId) {
        console.log(`♻️  Re-register for same user ${userId} — skipping DB bootstrap`);
        if (typeof callback === "function") callback({ success: true, reconnected: true });
        return;
      }
 
      registrationInProgress.add(socket.id);
      console.log(`📝 REGISTER — userId: ${userId}, role: ${role}, socketId: ${socket.id}`);
 
      try {
        // ── Remove previous identity if user switched ────────────────────
        if (currentUserId && currentUserId !== userId) {
          const prev = connectedUsers.get(currentUserId);
          if (prev) {
            prev.delete(socket.id);
            if (prev.size === 0) connectedUsers.delete(currentUserId);
          }
        }
 
        currentUserId = userId;
        currentUserRole = role;
 
        // ── Track connection (role-aware socket cap — ghost connection defence) ──
        // Office accounts are shared by multiple people on different devices in
        // the same physical office, so they get a much higher cap (20) to avoid
        // evicting a real person's connection.  Individual accounts (student,
        // supervisor) keep a tight cap of 5 — enough for one person on a few
        // devices, while still killing genuine ghost connections from crashes.
        const SOCKET_CAP = role === 'office' ? 20 : 5;
 
        if (!connectedUsers.has(userId)) connectedUsers.set(userId, new Map());
        const userSockets = connectedUsers.get(userId);
        userSockets.set(socket.id, { socketId: socket.id, role });
 
        // Evict oldest sockets beyond cap (ghost connection defence)
        if (userSockets.size > SOCKET_CAP) {
          const oldest = userSockets.keys().next().value;
          userSockets.delete(oldest);
          console.log(`🧹 Evicted ghost socket ${oldest} for user ${userId} (cap: ${SOCKET_CAP}, role: ${role})`);
        }
 
        // ── Batch-fetch notifications + request rooms in parallel ────────────
        const [allNotifications, userRequests] = await Promise.all([
          Notification.find({ userId, read: false }).sort({ createdAt: -1 }).limit(50),
          Request.find({
            $or: [{ requestedBy: userId }, { assignedTo: userId }]
          }).select("_id status")
        ]);
 
        // ── Filter stale notifications ────────────────────────────────────────
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        const requestCache = new Map();
        for (const r of userRequests) requestCache.set(r._id.toString(), r);
 
        // Fetch any referenced requests not already in the cache
        const missingIds = allNotifications
          .map(n => n.requestId?.toString())
          .filter(id => id && !requestCache.has(id));
 
        if (missingIds.length > 0) {
          const extra = await Request.find({ _id: { $in: missingIds } }).select("_id status assignedTo supervisorResponse");
          for (const r of extra) requestCache.set(r._id.toString(), r);
        }
 
        const validNotifications = [];
        for (const notif of allNotifications) {
          if (notif.createdAt && Date.now() - new Date(notif.createdAt).getTime() > SEVEN_DAYS_MS) continue;
          if (notif.requestId) {
            const req = requestCache.get(notif.requestId.toString());
            if (!req || req.status === "resolved") continue;
            if (notif.type === "new-request" && req.assignedTo) continue;
            if ((notif.type === "info" || notif.type === "warning") && req.supervisorResponse) continue;
            if (notif.type === "assignment" && req.status === "resolved") continue;
          }
          validNotifications.push(notif);
        }
 
        // Clean up stale ones
        const staleIds = allNotifications.filter(n => !validNotifications.includes(n)).map(n => n._id);
        if (staleIds.length > 0) {
          await Notification.deleteMany({ _id: { $in: staleIds } });
          console.log(`🧹 Removed ${staleIds.length} stale notifications for ${userId}`);
        }
 
        if (validNotifications.length > 0) {
          socket.emit("stored-notifications", validNotifications);
        }
 
        // ── Join request rooms ───────────────────────────────────────────────
        for (const request of userRequests) {
          socket.join(`request-${request._id}`);
        }
        console.log(`✅ Registration complete for ${userId} — joined ${userRequests.length} rooms`);
 
        if (typeof callback === "function") callback({ success: true });
      } catch (err) {
        console.error(`💥 Registration error for ${userId}:`, err);
        if (typeof callback === "function") callback({ success: false, error: err.message });
      } finally {
        registrationInProgress.delete(socket.id);
      }
    });
 
    // ── Join a specific request room ─────────────────────────────────────────
    socket.on("join_chat", (data) => {
      const requestId = data.requestId || data;
      if (!requestId) return;
      socket.join(`request-${requestId}`);
    });
 
    // ── Leave a request room ─────────────────────────────────────────────────
    socket.on("leave-request", (requestId) => {
      socket.leave(`request-${requestId}`);
    });
 
    // ── Send message ─────────────────────────────────────────────────────────
    socket.on("send_message", async (data) => {
      try {
        const { requestId, content, tempId } = data;
        if (!requestId || !content || !currentUserId) {
          socket.emit("message-error", { tempId, error: "Missing required fields or not registered" });
          return;
        }
 
        const message = await Message.create({
          requestId,
          sender: currentUserId,
          senderRole: currentUserRole,
          content,
          status: "sent",
          readBy: [currentUserId],
          createdAt: new Date()
        });
 
        const populatedMessage = await Message.findById(message._id).populate("sender", "name role");
 
        const formattedMessage = {
          _id: message._id,
          tempId,
          content: message.content,
          sender: message.sender,
          senderName: populatedMessage.sender?.name || "Unknown",
          senderRole: populatedMessage.sender?.role || currentUserRole,
          status: "sent",
          createdAt: message.createdAt,
          readBy: [currentUserId]
        };
 
        await Request.findByIdAndUpdate(requestId, {
          lastMessage: { content, sender: currentUserId, senderRole: currentUserRole, timestamp: new Date() }
        });
 
        const roomName = `request-${requestId}`;
        io.to(roomName).emit("new-message", { requestId, message: formattedMessage });
 
        setTimeout(async () => {
          try {
            await Message.findByIdAndUpdate(message._id, { status: "delivered" });
            io.to(roomName).emit("message-delivered", { messageId: message._id, requestId });
          } catch (err) {
            console.error("Error updating message status:", err);
          }
        }, 100);
      } catch (err) {
        console.error("ERROR sending message:", err);
        socket.emit("message-error", { tempId: data?.tempId, error: err.message });
      }
    });
 
    // ── Mark messages as read ────────────────────────────────────────────────
    socket.on("messages-read", async ({ requestId, userId, messageIds }) => {
      try {
        if (!requestId || !userId || !messageIds?.length) return;
        await Message.updateMany(
          { _id: { $in: messageIds }, readBy: { $ne: userId } },
          { $addToSet: { readBy: userId }, status: "read" }
        );
        socket.to(`request-${requestId}`).emit("messages-read", { requestId, userId, messageIds });
      } catch (err) {
        console.error("Error marking messages as read:", err);
      }
    });
 
    socket.on("mark_as_read", async (data) => {
      const { requestId, upToMessageId } = data;
      if (!requestId || !currentUserId) return;
      try {
        const query = {
          requestId,
          sender: { $ne: currentUserId },
          readBy: { $ne: currentUserId }
        };
        if (upToMessageId) query._id = { $lte: upToMessageId };
        await Message.updateMany(query, { $addToSet: { readBy: currentUserId } });
        const updated = await Message.find(query).select("_id");
        if (updated.length > 0) {
          socket.to(`request-${requestId}`).emit("messages-read", {
            requestId,
            userId: currentUserId,
            messageIds: updated.map(m => m._id)
          });
        }
      } catch (err) {
        console.error("Error in mark_as_read:", err);
      }
    });
 
    // ── Typing indicator ─────────────────────────────────────────────────────
    socket.on("typing", ({ requestId, isTyping }) => {
      socket.to(`request-${requestId}`).emit("user-typing", {
        userId: currentUserId,
        isTyping,
        timestamp: Date.now()
      });
    });
 
    // ── Office waiting ───────────────────────────────────────────────────────
    socket.on("office-waiting", (data) => {
      let count = 0;
      for (const [, userSockets] of connectedUsers.entries()) {
        for (const [socketId, socketData] of userSockets.entries()) {
          if (socketData.role === "supervisor") {
            io.to(socketId).emit("office-waiting", data);
            count++;
          }
        }
      }
      console.log(`📤 Sent office-waiting to ${count} supervisors`);
    });
 
    // ── Disconnect ───────────────────────────────────────────────────────────
    socket.on("disconnect", (reason) => {
      console.log(`🔌 DISCONNECT — ${socket.id}, reason: ${reason}, user: ${currentUserId || "unregistered"}`);
      registrationInProgress.delete(socket.id);
      if (currentUserId && connectedUsers.has(currentUserId)) {
        const userSockets = connectedUsers.get(currentUserId);
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          connectedUsers.delete(currentUserId);
          console.log(`👋 User ${currentUserId} fully offline`);
        }
      }
    });
 
    socket.on("error", (error) => {
      console.error(`Socket error on ${socket.id}:`, error);
    });
  });
}
