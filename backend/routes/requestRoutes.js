// backend/routes/requestRoutes.js
// Routes only — all business logic lives in requestController.js
import express from "express";
import {
  createRequest,
  assignRequest,
  selfAssignRequest,
  markResolved,
  getRequests,
  sendResponse,
  getTroubleshootingSteps,
  updateStepProgress,
} from "../controllers/requestController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/create", protect, createRequest);
router.post("/assign", protect, assignRequest);
router.post("/self-assign", protect, selfAssignRequest);
router.post("/resolve", protect, markResolved);
router.get("/", protect, getRequests);
router.post("/respond/:requestId", protect, sendResponse);
router.get("/:requestId/troubleshooting-steps", protect, getTroubleshootingSteps);
router.patch("/:requestId/step-progress", protect, updateStepProgress);

export default router;
