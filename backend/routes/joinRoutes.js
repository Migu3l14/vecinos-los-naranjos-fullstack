import express from 'express';
import { registerJoinRequest } from '../controllers/joinController.js';

const router = express.Router();

// POST /api/join-requests
router.post('/', registerJoinRequest);

export default router;
