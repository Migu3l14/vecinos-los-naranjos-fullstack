import express from 'express';
import { getStats, registerVisit } from '../controllers/statsController.js';

const router = express.Router();

// GET /api/stats — visitas y emprendedores para la portada
router.get('/', getStats);

// POST /api/stats/visit — registra una vista (dedupe por día/sesión en cliente)
router.post('/visit', registerVisit);

export default router;