// backend/middleware/authMiddleware.js
// backend/middleware/authMiddleware.js
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import User from "../models/User.js";

dotenv.config();

export const protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      console.log("❌ No token provided");
      return res.status(401).json({ message: "No token, authorization denied" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("🔐 Token decoded:", decoded);

    // Get user ID from token (could be in id or userId)
    const userId = decoded.id || decoded.userId;
    
    if (!userId) {
      console.log("❌ No user ID in token");
      return res.status(401).json({ message: "Invalid token structure" });
    }

    // Fetch the full user from database
    const user = await User.findById(userId).select("-password");
    
    if (!user) {
      console.log("❌ User not found in database:", userId);
      return res.status(401).json({ message: "User not found" });
    }

    // Reject soft-deleted accounts
    if (user.isDeleted) {
      return res.status(401).json({ message: "This account has been deactivated" });
    }

    console.log(`✅ User authenticated: ${user.name} (${user._id}) - Role: ${user.role}`);
    
    // Set user object with all needed fields
    req.user = {
      _id: user._id,
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      office: user.office
    };
    
    next();
  } catch (error) {
    console.error("❌ Auth error:", error.message);
    res.status(401).json({ message: "Token is not valid" });
  }
};

// 🔒 Supervisor-only middleware
export const supervisorOnly = (req, res, next) => {
  if (req.user.role !== "supervisor") {
    return res
      .status(403)
      .json({ message: "Access denied — Supervisors only" });
  }
  next();
};