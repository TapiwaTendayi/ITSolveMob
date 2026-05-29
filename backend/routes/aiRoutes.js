// backend/routes/aiRoutes.js
// Routes only — all business logic lives in aiController.js
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { aiChat, aiTroubleshoot } from '../controllers/aiController.js';

const router = express.Router();

router.post('/chat', protect, aiChat);
router.post('/troubleshoot', protect, aiTroubleshoot);

export default router;
