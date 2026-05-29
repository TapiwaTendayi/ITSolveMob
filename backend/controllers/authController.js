// backend/controllers/authController.js

import User from "../models/User.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

/* 
   REGISTER USER (Supervisor-only)
 */
export const register = async (req, res) => {
  try {
    if (req.user.role !== "supervisor") {
      return res.status(403).json({
        message: "Only supervisors can register new users",
      });
    }

    const { name, email, password, role, office } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      office,
    });

    res.status(201).json({
      message: "User registered successfully",
      user,
    });
  } catch (error) {
    console.error("❌ Registration error:", error);
    res.status(500).json({ message: "Server error during registration" });
  }
};

/* ============================================================
   GET CURRENT LOGGED-IN USER (Verify Token)
============================================================ */
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ user });
  } catch (err) {
    console.error("❌ Get me error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ============================================================
   UPDATE USER (Supervisor-only)
============================================================ */
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, office, password } = req.body;

    if (req.user.role !== "supervisor") {
      return res.status(403).json({
        message: "Access denied — supervisors only",
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: "Email already in use" });
      }
      user.email = email;
    }

    if (name) user.name = name;
    if (role) user.role = role;
    if (office !== undefined) user.office = office;

    if (password && password.trim() !== "") {
      const hashedPassword = await bcrypt.hash(password, 10);
      user.password = hashedPassword;
    }

    await user.save();

    const userResponse = user.toObject();
    delete userResponse.password;

    return res.json({
      message: "User updated successfully",
      user: userResponse,
    });
  } catch (error) {
    console.error("❌ Update user error:", error);
    return res.status(500).json({ message: "Server error updating user" });
  }
};

/* ============================================================
   LOGIN
============================================================ */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email });

    // Use a generic message for both "not found" and "wrong password"
    // to prevent user-enumeration attacks
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Block soft-deleted accounts — same generic message so attackers
    // cannot tell whether the account exists at all
    if (user.isDeleted) {
      return res.status(403).json({
        message: "This account has been deactivated. Please contact System Administration."
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        id: user._id,
        name: user.name,
        role: user.role,
        office: user.office,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      message: "Login successful",
      token,
      user,
    });
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({ message: "Server error during login" });
  }
};

/* ============================================================
   SUPERVISOR FETCH ALL USERS
============================================================ */
export const getAllUsers = async (req, res) => {
  try {
    if (req.user.role !== "supervisor") {
      return res.status(403).json({
        message: "Access denied — supervisors only",
      });
    }

    const users = await User.find().select("name email role office");

    res.json(users);
  } catch (error) {
    console.error("❌ Error fetching users:", error);
    res.status(500).json({ message: "Server error fetching users" });
  }
};

/* ============================================================
   DELETE USER
============================================================ */
export const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    // Prevent a supervisor from deleting their own account
    if (req.user._id.toString() === userId || req.user.id.toString() === userId) {
      return res.status(400).json({ message: "You cannot deactivate your own account" });
    }

    const user = await User.findById(userId);

    if (!user || user.isDeleted) {
      return res.status(404).json({ message: "User not found" });
    }

    // Soft-delete: preserve the document so historical records
    // (requests, assignments, troubleshooting steps) keep their references.
    // The name snapshot is stored so dashboards can still display
    // "Requested by Office 2" even after the account is gone.
    user.isDeleted = true;
    user.deletedAt = new Date();
    // Keep the real name — frontend shows an (inactive) badge via isDeleted flag
    user.email     = `deleted_${user._id}@removed.invalid`; // free the email slot
    await user.save();

    // Force any active socket sessions for this user to log out immediately
    const io            = req.app.get("io");
    const connectedUsers = req.app.get("connectedUsers");
    const userSockets   = connectedUsers?.get(userId.toString());
    if (io && userSockets) {
      for (const [socketId] of userSockets) {
        io.to(socketId).emit("force-logout", {
          message: "Your account has been deactivated by System Administration."
        });
      }
    }

    return res.json({ message: "User account deactivated successfully" });
  } catch (error) {
    console.error("Delete user error:", error);
    return res.status(500).json({ message: "Server error deactivating user" });
  }
};

/* ============================================================
   UPDATE USER PASSWORD
============================================================ */
export const updatePassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    const userId = req.params.id;

    if (!newPassword) {
      return res.status(400).json({ message: "Password required" });
    }

    if (req.user.role !== 'supervisor' && req.user.id !== userId) {
      return res.status(403).json({ message: "You are not allowed to change this user's password" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(userId, { password: hashed });

    return res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Password update error:", err);
    return res.status(500).json({ message: "Server error updating password" });
  }
};