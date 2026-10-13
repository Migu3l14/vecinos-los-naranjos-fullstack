import express from 'express';
import { getCategories } from '../controllers/categoryController.js';
import { cachePublic } from '../middleware/cache.js';

const router = express.Router();

// GET /api/categories — catálogo estable: caché larga en navegador y CDN
router.get('/', cachePublic({ maxAge: 3600, sMaxAge: 86400, staleWhileRevalidate: 86400 }), getCategories);

export default router;
