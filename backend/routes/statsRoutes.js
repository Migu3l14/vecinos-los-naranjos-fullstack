import express from 'express';
import { getStats, registerVisit } from '../controllers/statsController.js';
import { cachePublic } from '../middleware/cache.js';

const router = express.Router();

// GET /api/stats — visitas y emprendedores para la portada (TTL corto)
router.get('/', cachePublic({ maxAge: 60, sMaxAge: 300, staleWhileRevalidate: 300 }), getStats);

// POST /api/stats/visit — registra una vista (dedupe por día/sesión en cliente)
router.post('/visit', registerVisit);

export default router;