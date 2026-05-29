// backend/routes/authRoutes.js
import express from "express";
import {
  register,
  login,
  getAllUsers,
  deleteUser,
  updatePassword,
  updateUser,
  getMe,  // ← ADD THIS IMPORT
} from "../controllers/authController.js";
import { protect, supervisorOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

// Get current logged-in user
router.get("/me", protect, getMe);  // ← ADD THIS ROUTE

// Supervisor creates users
router.post("/register", protect, supervisorOnly, register);

// Login
router.post("/login", login);

// Supervisor fetches all users
router.get("/users", protect, supervisorOnly, getAllUsers);

// Supervisor updates user
router.put("/users/:id", protect, supervisorOnly, updateUser);

// Delete user
router.delete("/delete/:id", protect, supervisorOnly, deleteUser);

// Update password – any authenticated user can update their own password
router.put("/password/:id", protect, updatePassword);

export default router;