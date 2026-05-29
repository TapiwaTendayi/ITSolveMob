import express from "express";
import { protect, supervisorOnly } from "../middleware/authMiddleware.js";
import {
  getAllUsers,
  createUser,
  deleteUser,
} from "../controllers/userController.js";

const router = express.Router();

// 🔐 All routes below require supervisor role
router.use(protect, supervisorOnly);

// 📌 GET all users (office + students)
router.get("/", getAllUsers);

// 📌 Create user (office or student)
router.post("/create", createUser);

// 📌 Delete user
router.delete("/:id", deleteUser);

export default router;
