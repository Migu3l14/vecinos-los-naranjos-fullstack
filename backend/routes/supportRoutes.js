import express from 'express';
import { getSupportChannels, createSupportRequest, getSupportRequests } from '../controllers/supportController.js';
import { authAdmin } from '../middleware/auth.js';

const router = express.Router();

// GET /api/support — canales de soporte disponibles para el frente
router.get('/', getSupportChannels);

// POST /api/support/request (público) — el emprendedor deja su número
router.post('/request', createSupportRequest);

// GET /api/support/requests (admin) — solicitudes para contactar
router.get('/requests', authAdmin, getSupportRequests);

export default router;