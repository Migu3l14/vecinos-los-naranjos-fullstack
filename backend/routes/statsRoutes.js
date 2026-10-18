import express from 'express';
import { getStats, registerVisit, getAdminStats } from '../controllers/statsController.js';
import { cachePublic } from '../middleware/cache.js';
import { authSuperAdmin } from '../middleware/auth.js';

const router = express.Router();

// GET /api/stats — visitas y emprendedores para la portada (TTL corto)
router.get('/', cachePublic({ maxAge: 60, sMaxAge: 300, staleWhileRevalidate: 300 }), getStats);

// GET /api/stats/admin — métricas del panel (solo super admin)
router.get('/admin', authSuperAdmin, getAdminStats);

// POST /api/stats/visit — registra una vista (dedupe por día/sesión en cliente)
router.post('/visit', registerVisit);

export default router;