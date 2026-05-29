// backend/controllers/requestController.js
import Request from "../models/Request.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";

// Create a new request (Office user)
export const createRequest = async (req, res) => {
  try {
    console.log("📝 Create request - req.user:", req.user);
    console.log("📝 Request body:", req.body);
    
    const { title, description, troubleshooting, category } = req.body;
    
    // Validate required fields
    if (!description) {
      return res.status(400).json({ message: "Description is required" });
    }
    
    // Get user ID correctly
    const userId = req.user._id || req.user.id;
    const userName = req.user.name || "Office User";
    
    if (!userId) {
      console.error("❌ No user ID found in request");
      return res.status(401).json({ message: "User not authenticated" });
    }
    
    console.log(`📝 Creating request for user: ${userName} (${userId})`);

    // Fetch full user so we can snapshot name/office/email before any future deletion
    const creatingUser = await User.findById(userId).select("name email office");

    // Create request (no AI analysis - simplified)
    const requestData = {
      title: title || description.substring(0, 50),
      description: description,
      troubleshooting: troubleshooting || "",
      category: category || "general",
      requestedBy: userId,
      // ── Snapshot: preserved even if the office user is later deleted ───
      requestedBySnapshot: {
        name:   creatingUser?.name   || userName,
        office: creatingUser?.office || "",
        email:  creatingUser?.email  || "",
      },
      status: "pending",
      createdAt: new Date()
    };

    const request = await Request.create(requestData);

    console.log(`✅ Request created: ${request._id}`);
    
    // Populate the request with user info
    const populatedRequest = await Request.findById(request._id)
      .populate("requestedBy", "name email role office isDeleted");
    
    // Get socket.io instance
    const io = req.app.get("io");
    const connectedUsers = req.app.get("connectedUsers");
    
    // Get all supervisors
    const supervisors = await User.find({ role: "supervisor" }).select("_id name email");
    // Get all students
    const students = await User.find({ role: "student" }).select("_id name email");
    
    console.log(`📤 Found ${supervisors.length} supervisors and ${students.length} students to notify`);
    
    // Create notification message
    const notificationMessage = {
      type: "new_request",
      title: "📋 New Support Request",
      message: `New request from ${userName}: "${(title || description).substring(0, 50)}"`,
      requestId: request._id,
      requestTitle: title || description.substring(0, 50),
      createdBy: userName,
      createdAt: new Date(),
      priority: "high",
      hasAiSuggestions: false,
      isHardwareIssue: false,
      request: populatedRequest
    };
    
    // Send REAL-TIME notification to all connected supervisors and students
    let notifiedCount = 0;
    const offlineSupervisors = [];
    const offlineStudents = [];
    
    if (io && connectedUsers) {
      // Notify supervisors
      for (const supervisor of supervisors) {
        const supervisorSockets = connectedUsers.get(supervisor._id.toString());
        if (supervisorSockets && supervisorSockets.size > 0) {
          for (const [socketId, socketData] of supervisorSockets.entries()) {
            io.to(socketId).emit("new-request", notificationMessage);
            notifiedCount++;
            console.log(`📤 Instant notification sent to supervisor ${supervisor.name} (${supervisor._id}) via socket ${socketId}`);
          }
        } else {
          offlineSupervisors.push(supervisor);
          console.log(`💾 Supervisor ${supervisor.name} is offline - will save notification`);
        }
      }
      
      // Notify ALL students about new request
      let studentsNotified = 0;
      for (const student of students) {
        const studentSockets = connectedUsers.get(student._id.toString());
        if (studentSockets && studentSockets.size > 0) {
          for (const [socketId, socketData] of studentSockets.entries()) {
            io.to(socketId).emit("new-request", notificationMessage);
            studentsNotified++;
            console.log(`📤 New request notification sent to student ${student.name} (${student._id}) via socket ${socketId}`);
          }
        } else {
          offlineStudents.push(student);
          console.log(`💾 Student ${student.name} is offline - will save notification`);
        }
      }
      console.log(`📤 Notified ${studentsNotified} online students instantly`);
      
      // Save notifications for offline supervisors
      if (offlineSupervisors.length > 0) {
        const notifications = [];
        for (const supervisor of offlineSupervisors) {
          notifications.push({
            userId: supervisor._id,
            type: 'new-request',
            message: `New request from ${userName}: "${(title || description).substring(0, 50)}"`,
            requestId: request._id,
            read: false,
            createdAt: new Date()
          });
        }
        if (notifications.length > 0) {
          try {
            await Notification.insertMany(notifications, { ordered: false });
            console.log(`💾 Saved ${notifications.length} offline notifications for supervisors`);
          } catch (notifError) {
            console.error("⚠️ Error saving notifications:", notifError.message);
          }
        }
      }
      
      // Save "new-request" notifications for offline students as well
      if (offlineStudents.length > 0) {
        const studentNotifications = [];
        for (const student of offlineStudents) {
          studentNotifications.push({
            userId: student._id,
            type: 'new-request',
            message: `New request from ${userName}: "${(title || description).substring(0, 50)}"`,
            requestId: request._id,
            read: false,
            createdAt: new Date()
          });
        }
        if (studentNotifications.length > 0) {
          try {
            await Notification.insertMany(studentNotifications, { ordered: false });
            console.log(`💾 Saved ${studentNotifications.length} offline notifications for students`);
          } catch (notifError) {
            console.error("⚠️ Error saving student offline notifications:", notifError.message);
          }
        }
      }
    } else {
      console.log("⚠️ Socket.io not initialized, skipping notifications");
    }
    
    console.log(`✅ Request created successfully: ${request._id}`);
    console.log(`📤 Notified ${notifiedCount} online supervisor connections instantly`);
    
    res.status(201).json({
      success: true,
      message: "Request created successfully",
      request: populatedRequest,
      notificationsSent: notifiedCount
    });
    
  } catch (err) {
    console.error("❌ Error creating request:", err);
    console.error("Stack trace:", err.stack);
    res.status(500).json({ 
      message: "Server error", 
      error: err.message 
    });
  }
};

// Get all requests (with filters based on role)
export const getRequests = async (req, res) => {
  try {
    let query = {};
    
    const userId = req.user._id || req.user.id;
    
    if (req.user.role === "office") {
      query.requestedBy = userId;
    }
    
    console.log(`📡 Fetching requests for role: ${req.user.role}, userId: ${userId}`);
    
    const requests = await Request.find(query)
      .populate("requestedBy", "name email role office isDeleted")
      .populate("assignedTo", "name email role isDeleted")
      .sort({ createdAt: -1 });
    
    console.log(`📡 Found ${requests.length} requests`);
    
    res.json(requests);
    
  } catch (err) {
    console.error("Error fetching requests:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Assign request to student/supervisor
export const assignRequest = async (req, res) => {
  try {
    // Only supervisors may assign requests
    if (req.user.role !== "supervisor") {
      return res.status(403).json({ message: "Only supervisors can assign requests" });
    }

    const { requestId, studentId } = req.body;
    
    const request = await Request.findById(requestId)
      .populate("requestedBy", "name email role office isDeleted")
      .populate("assignedTo", "name email role isDeleted");
    
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }
    
    // Get the student/user details
    const assignedUser = await User.findById(studentId).select("name email role");
    if (!assignedUser) {
      return res.status(404).json({ message: "User not found" });
    }
    
    request.assignedTo = studentId;
    // ── Snapshot the assignee's name/email so it survives deletion ──────
    request.assignedToSnapshot = {
      name:  assignedUser.name  || "",
      email: assignedUser.email || "",
    };
    await request.save();

    // Cleanup obsolete notifications - remove "new-request" notifications for this request
    await Notification.deleteMany({
      requestId: request._id,
      type: 'new-request'
    });
    
    // Get socket.io instance
    const io = req.app.get("io");
    const connectedUsers = req.app.get("connectedUsers");
    
    // Prepare assignment notification
    const assignmentMessage = {
      type: "task_assigned",
      message: `🎯 New task assigned: "${request.title}"`,
      requestId: request._id,
      requestTitle: request.title,
      assignedBy: req.user.name,
      assignedTo: assignedUser.name,
      timestamp: new Date()
    };
    
    // Send REAL-TIME notification to the assigned student
    const studentSockets = connectedUsers?.get(studentId.toString());
    let notificationSent = false;
    
    if (studentSockets && studentSockets.size > 0) {
      for (const [socketId, socketData] of studentSockets.entries()) {
        io.to(socketId).emit("task-assigned", assignmentMessage);
        notificationSent = true;
        console.log(`📤 Task assignment notification sent to student ${assignedUser.name} (${studentId}) via socket ${socketId}`);
      }
    } else {
      // Save notification for offline student
      try {
        await Notification.create({
          userId: studentId,
          type: "assignment",
          message: assignmentMessage.message,
          requestId: request._id,
          read: false,
          createdAt: new Date()
        });
        console.log(`💾 Saved assignment notification for offline student ${assignedUser.name}`);
      } catch (notifError) {
        console.error("⚠️ Error saving notification:", notifError.message);
      }
    }
    
    // Also notify all supervisors about the assignment update
    const supervisors = await User.find({ role: "supervisor" }).select("_id");
    for (const supervisor of supervisors) {
      const supervisorSockets = connectedUsers?.get(supervisor._id.toString());
      if (supervisorSockets && supervisorSockets.size > 0) {
        for (const [socketId, socketData] of supervisorSockets.entries()) {
          io.to(socketId).emit("request-updated", {
            requestId: request._id,
            action: "assigned",
            assignedTo: assignedUser.name
          });
        }
      }
    }

    // ── Notify the office user who raised the request ──────────────────────
    // Let them know a technician has been assigned and is on the way.
    if (request.requestedBy) {
      const officeUserId = request.requestedBy._id
        ? request.requestedBy._id.toString()
        : request.requestedBy.toString();
      const officeNotifyMsg = `🔧 ${req.user.name} has assigned ${assignedUser.name} to attend your request: "${request.title}". A technician is on the way.`;
      const officeSockets = connectedUsers?.get(officeUserId);
      if (officeSockets && officeSockets.size > 0) {
        for (const [socketId] of officeSockets.entries()) {
          io.to(socketId).emit("task-attending", {
            message: officeNotifyMsg,
            requestId: request._id,
            requestTitle: request.title,
            assignedTo: assignedUser.name,
            assignedBy: req.user.name,
          });
        }
        console.log(`📤 Office user notified: technician ${assignedUser.name} assigned by supervisor ${req.user.name}`);
      } else {
        // Office user offline — save persistent notification
        try {
          await Notification.create({
            userId: officeUserId,
            type: "info",
            message: officeNotifyMsg,
            requestId: request._id,
            read: false,
            createdAt: new Date(),
          });
          console.log(`💾 Saved task-attending notification for offline office user`);
        } catch (e) {
          console.error("⚠️ Error saving office notification:", e.message);
        }
      }
    }

    const populatedRequest = await Request.findById(requestId)
      .populate("assignedTo", "name email role isDeleted");
    
    res.json({
      success: true,
      message: "Request assigned successfully",
      request: populatedRequest,
      notificationSent: notificationSent
    });
    
  } catch (err) {
    console.error("Error assigning request:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Mark request as resolved
export const markResolved = async (req, res) => {
  try {
    const { requestId } = req.body;
    
    const request = await Request.findById(requestId)
      .populate("requestedBy", "name email")
      .populate("assignedTo", "name email");
    
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    // ── Authorisation: only the office user who created the request,
    //    or a supervisor, may mark it resolved.
    const requesterId = request.requestedBy._id.toString();
    const callerId    = (req.user._id || req.user.id).toString();
    const callerRole  = req.user.role;
    if (callerRole !== "supervisor" && requesterId !== callerId) {
      return res.status(403).json({ message: "Not authorised to resolve this request" });
    }

    request.status = "resolved";
    request.resolvedAt = new Date();
    await request.save();

    // Delete ALL stored notifications for this request for every user — they are no longer relevant
    const deletedNotifs = await Notification.deleteMany({ requestId: request._id });
    console.log(`🧹 Cleared ${deletedNotifs.deletedCount} stored notifications for resolved request ${request._id}`);
    
    // Get socket.io instance
    const io = req.app.get("io");
    const connectedUsers = req.app.get("connectedUsers");
    
    // Prepare resolution notification
    const resolutionMessage = {
      type: "request_resolved",
      message: `✅ Request "${request.title}" has been marked as resolved`,
      requestId: request._id,
      requestTitle: request.title,
      resolvedBy: req.user.name,
      resolvedAt: new Date(),
      status: "resolved"
    };
    
    // Notify the office user who created the request — toast ONLY (no persistent notification)
    const officeUserId = request.requestedBy._id.toString();
    const officeSockets = connectedUsers?.get(officeUserId);
    let officeNotified = false;
    
    if (officeSockets && officeSockets.size > 0) {
      for (const [socketId, socketData] of officeSockets.entries()) {
        // Use "request-resolved-toast" so the frontend shows a toast but NOT a notification badge
        io.to(socketId).emit("request-resolved-toast", resolutionMessage);
        officeNotified = true;
        console.log(`📤 Toast-only resolution sent to office user ${request.requestedBy.name} via socket ${socketId}`);
      }
    }
    
    // Notify ALL students
    const students = await User.find({ role: "student" }).select("_id name");
    let studentsNotified = 0;
    for (const student of students) {
      const studentSockets = connectedUsers?.get(student._id.toString());
      if (studentSockets && studentSockets.size > 0) {
        for (const [socketId, socketData] of studentSockets.entries()) {
          io.to(socketId).emit("request-resolved", resolutionMessage);
          studentsNotified++;
          console.log(`📤 Resolution notification sent to student ${student.name} via socket ${socketId}`);
        }
      }
    }
    console.log(`📤 Notified ${studentsNotified} online students`);
    
    // Notify ALL supervisors
    const supervisors = await User.find({ role: "supervisor" }).select("_id name");
    let supervisorsNotified = 0;
    for (const supervisor of supervisors) {
      const supervisorSockets = connectedUsers?.get(supervisor._id.toString());
      if (supervisorSockets && supervisorSockets.size > 0) {
        for (const [socketId, socketData] of supervisorSockets.entries()) {
          io.to(socketId).emit("request-resolved", resolutionMessage);
          supervisorsNotified++;
          console.log(`📤 Resolution notification sent to supervisor ${supervisor.name} via socket ${socketId}`);
        }
      }
    }
    console.log(`📤 Notified ${supervisorsNotified} online supervisors`);
    
    // Office user does NOT get a stored notification for resolution — toast only when online
    
    res.json({
      success: true,
      message: "Request marked as resolved",
      notificationSent: officeNotified
    });
    
  } catch (err) {
    console.error("Error marking resolved:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Send response from supervisor to office user
export const sendResponse = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { response } = req.body;
    
    const request = await Request.findById(requestId).populate("requestedBy", "name email");
    
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }
    
    // Save response to request
    request.supervisorResponse = response;
    request.supervisorRespondedAt = new Date();
    await request.save();

    // Delete "office-waiting" type notifications for this request
    await Notification.deleteMany({
      requestId: request._id,
      type: { $in: ['info', 'warning'] }
    });
    
    // Get socket.io instance
    const io = req.app.get("io");
    const connectedUsers = req.app.get("connectedUsers");
    
    // Get office user ID
    const officeUserId = request.requestedBy._id.toString();
    
    // Prepare notification message
    const notificationMessage = {
      type: "supervisor_response",
      message: `📝 Supervisor responded to your request: "${request.title}"`,
      requestId: request._id,
      requestTitle: request.title,
      response: response,
      respondedBy: req.user.name,
      timestamp: new Date()
    };
    
    // Send instant notification to office user if online
    const officeSockets = connectedUsers?.get(officeUserId);
    let notificationSent = false;
    
    if (officeSockets && officeSockets.size > 0) {
      for (const [socketId, socketData] of officeSockets.entries()) {
        io.to(socketId).emit("supervisor-response", notificationMessage);
        notificationSent = true;
        console.log(`📤 Instant response notification sent to office user ${officeUserId} via socket ${socketId}`);
      }
    } else {
      // Save notification for offline office user
      try {
        await Notification.create({
          userId: officeUserId,
          type: "success",
          message: notificationMessage.message,
          requestId: request._id,
          read: false,
          createdAt: new Date()
        });
        console.log(`💾 Saved response notification for offline office user ${officeUserId}`);
      } catch (notifError) {
        console.error("⚠️ Error saving notification:", notifError.message);
      }
    }
    
    res.json({
      success: true,
      message: "Response sent successfully",
      notificationSent: notificationSent
    });
    
  } catch (err) {
    console.error("Error sending response:", err);
    res.status(500).json({ message: "Server error" });
  }
};
// Self-assign a request (student picks up an unassigned task when supervisor is busy/absent)
export const selfAssignRequest = async (req, res) => {
  try {
    const { requestId } = req.body;
    const userId = req.user._id || req.user.id;

    // Only students can self-assign
    if (req.user.role !== 'student') {
      return res.status(403).json({ message: 'Only technicians can self-assign requests' });
    }

    const request = await Request.findById(requestId)
      .populate('requestedBy', 'name email role office')
      .populate('assignedTo', 'name email role isDeleted');

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    if (request.status === 'resolved') {
      return res.status(400).json({ message: 'This request has already been resolved' });
    }

    if (request.assignedTo) {
      return res.status(400).json({
        message: `This request is already assigned to ${request.assignedTo.name}`
      });
    }

    // Assign to self
    request.assignedTo = userId;
    // ── Snapshot so the name survives deletion ────────────────────────────
    request.assignedToSnapshot = {
      name:  req.user.name  || "",
      email: req.user.email || "",
    };
    request.selfAssigned = true;
    request.selfAssignedAt = new Date();
    await request.save();

    // Clean up any pending new-request notifications for this request
    await Notification.deleteMany({ requestId: request._id, type: 'new-request' });

    const io = req.app.get('io');
    const connectedUsers = req.app.get('connectedUsers');

    const selfAssignMessage = {
      type: 'self_assigned',
      message: `🎯 ${req.user.name} has self-assigned request: "${request.title}"`,
      requestId: request._id,
      requestTitle: request.title,
      assignedTo: req.user.name,
      assignedToId: userId,
      timestamp: new Date()
    };

    // Notify all supervisors
    const supervisors = await User.find({ role: 'supervisor' }).select('_id name');
    for (const supervisor of supervisors) {
      const sockets = connectedUsers?.get(supervisor._id.toString());
      if (sockets && sockets.size > 0) {
        for (const [socketId] of sockets.entries()) {
          io?.to(socketId).emit('request-updated', selfAssignMessage);
        }
      } else {
        // Save notification for offline supervisor
        try {
          await Notification.create({
            userId: supervisor._id,
            type: 'info',
            message: selfAssignMessage.message,
            requestId: request._id,
            read: false,
            createdAt: new Date()
          });
        } catch (e) {
          console.error('⚠️ Error saving supervisor notification:', e.message);
        }
      }
    }

    // Notify all other online students so their dashboards refresh
    const students = await User.find({ role: 'student', _id: { $ne: userId } }).select('_id');
    for (const student of students) {
      const sockets = connectedUsers?.get(student._id.toString());
      if (sockets && sockets.size > 0) {
        for (const [socketId] of sockets.entries()) {
          io?.to(socketId).emit('request-updated', selfAssignMessage);
        }
      }
    }

    // Notify the office user who raised the request
    const officeUserId = request.requestedBy._id.toString();
    const officeNotifyMsg = `🔧 ${req.user.name} (technician) has picked up your request: "${request.title}" and will attend to you shortly.`;
    const officeSockets = connectedUsers?.get(officeUserId);
    if (officeSockets && officeSockets.size > 0) {
      for (const [socketId] of officeSockets.entries()) {
        io?.to(socketId).emit('task-attending', {
          ...selfAssignMessage,
          message: officeNotifyMsg,
        });
      }
      console.log(`📤 Office user notified: technician ${req.user.name} self-assigned and is attending`);
    } else {
      // Office user is offline — save persistent notification so they see it on next login
      try {
        await Notification.create({
          userId: officeUserId,
          type: 'info',
          message: officeNotifyMsg,
          requestId: request._id,
          read: false,
          createdAt: new Date(),
        });
        console.log(`💾 Saved task-attending notification for offline office user`);
      } catch (e) {
        console.error('⚠️ Error saving office notification:', e.message);
      }
    }

    const populatedRequest = await Request.findById(requestId)
      .populate('requestedBy', 'name email role office')
      .populate('assignedTo', 'name email role isDeleted');

    res.json({
      success: true,
      message: 'Request self-assigned successfully',
      request: populatedRequest
    });

  } catch (err) {
    console.error('Error self-assigning request:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get troubleshooting steps for a specific request
export const getTroubleshootingSteps = async (req, res) => {
  try {
    const request = await Request.findById(req.params.requestId)
      .populate('requestedBy', 'name email role');

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    if (request.status === 'resolved' || request.resolvedAt) {
      return res.json({
        steps: [], source: null, aiUsed: false, isResolved: true,
        message: 'This request has been resolved. No troubleshooting steps available.'
      });
    }

    const isOwner = request.requestedBy?._id?.toString() === req.user._id.toString();
    const isSupervisor = req.user.role === 'supervisor' || req.user.role === 'admin';
    const isStudent = req.user.role === 'student';

    if (!isSupervisor && !isOwner && !isStudent) {
      return res.status(403).json({ message: 'Not authorized to view these troubleshooting steps' });
    }

    if (request.troubleshootingSteps?.steps?.length > 0) {
      return res.json({
        steps: request.troubleshootingSteps.steps,
        source: request.troubleshootingSteps.source,
        aiUsed: request.troubleshootingSteps.aiUsed,
        category: request.troubleshootingSteps.category,
        generatedAt: request.troubleshootingSteps.generatedAt,
        completedSteps: request.completedSteps || [],
        stepsUpdatedAt: request.stepsUpdatedAt,
        isResolved: false
      });
    }

    res.json({
      steps: [], source: null, aiUsed: false, isResolved: false,
      message: 'No troubleshooting steps available for this request yet.'
    });
  } catch (error) {
    console.error('Error fetching troubleshooting steps:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Save step progress (office user ticking troubleshooting steps)
export const updateStepProgress = async (req, res) => {
  try {
    const { completedSteps } = req.body;
    const { requestId } = req.params;

    const request = await Request.findById(requestId);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    const ownerId = request.requestedBy?.toString();
    const callerId = (req.user._id || req.user.id)?.toString();
    if (ownerId !== callerId) {
      return res.status(403).json({ message: 'Only the requester can update step progress' });
    }

    request.completedSteps = completedSteps;
    request.stepsUpdatedAt = new Date();
    await request.save();

    const io = req.app.get('io');
    const connectedUsers = req.app.get('connectedUsers');
    const payload = { requestId, completedSteps, updatedAt: request.stepsUpdatedAt };

    const supervisors = await User.find({ role: 'supervisor' }).select('_id');
    for (const sup of supervisors) {
      const sockets = connectedUsers?.get(sup._id.toString());
      if (sockets) for (const [sid] of sockets) io?.to(sid).emit('step-progress-updated', payload);
    }
    const students = await User.find({ role: 'student' }).select('_id');
    for (const stu of students) {
      const sockets = connectedUsers?.get(stu._id.toString());
      if (sockets) for (const [sid] of sockets) io?.to(sid).emit('step-progress-updated', payload);
    }

    res.json({ success: true, completedSteps: request.completedSteps });
  } catch (err) {
    console.error('Error saving step progress:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

