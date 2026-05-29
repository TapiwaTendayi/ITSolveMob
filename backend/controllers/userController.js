import User from "../models/User.js";

// 📌 GET all active Office + Student + Supervisor accounts (excludes soft-deleted)
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({
      role:      { $in: ["office", "student", "supervisor"] },
      isDeleted: { $ne: true },
    })
      .select("-password")
      .sort({ createdAt: -1 });

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Error fetching users" });
  }
};

// 📌 Supervisor creates a new Office or Student user
export const createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!["office", "student"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    // Allow re-creating a previously soft-deleted account with the same email
    const exists = await User.findOne({ email });
    if (exists && !exists.isDeleted) {
      return res.status(400).json({ message: "Email already exists" });
    }
    if (exists && exists.isDeleted) {
      // Restore the account rather than creating a duplicate document
      exists.name      = name;
      exists.password  = password;
      exists.role      = role;
      exists.isDeleted = false;
      exists.deletedAt = null;
      await exists.save();
      return res.status(201).json({
        message: "User account restored successfully",
        user: { id: exists._id, name: exists.name, email: exists.email, role: exists.role },
      });
    }

    const newUser = await User.create({ name, email, password, role });
    res.status(201).json({
      message: "User created successfully",
      user: { id: newUser._id, name: newUser.name, email: newUser.email, role: newUser.role },
    });
  } catch (err) {
    res.status(500).json({ message: "Error creating user" });
  }
};

// 📌 Soft-delete a user
//    - Marks isDeleted=true instead of removing the document
//    - This preserves all FK references in Requests, Messages, Notifications
//    - Also immediately kicks the user's live socket connections
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Prevent deleting yourself
    const callerId = (req.user._id || req.user.id).toString();
    if (user._id.toString() === callerId) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }

    // Soft-delete
    user.isDeleted = true;
    user.deletedAt = new Date();
    await user.save();

    // Kick any live socket connections for this user
    const io             = req.app.get("io");
    const connectedUsers = req.app.get("connectedUsers");
    const userSockets    = connectedUsers?.get(user._id.toString());
    if (io && userSockets) {
      for (const [socketId] of userSockets.entries()) {
        io.to(socketId).emit("force-logout", {
          message: "Your account has been deactivated by an administrator.",
        });
        const sock = io.sockets.sockets.get(socketId);
        if (sock) sock.disconnect(true);
      }
      connectedUsers.delete(user._id.toString());
    }

    res.json({ message: "User deactivated successfully" });
  } catch (err) {
    console.error("Error soft-deleting user:", err);
    res.status(500).json({ message: "Error deleting user" });
  }
};
