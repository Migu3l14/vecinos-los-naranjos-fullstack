import express from 'express';
import {
  createAnnouncement,
  getPublicAnnouncements,
  getAdminAnnouncements,
  deleteAnnouncement,
  broadcastAnnouncement,
  getRecipientsCount
} from '../controllers/announcementController.js';
import { authAdmin } from '../middleware/auth.js';
import { cachePublic } from '../middleware/cache.js';

const router = express.Router();

// Público: comunicados oficiales publicados, segmentados por manzana (TTL corto)
router.get('/', cachePublic({ maxAge: 30, sMaxAge: 120, staleWhileRevalidate: 120 }), getPublicAnnouncements);

// Admin por manzana
router.get('/recipients/count', authAdmin, getRecipientsCount);
router.get('/admin', authAdmin, getAdminAnnouncements);
router.post('/', authAdmin, createAnnouncement);
router.post('/:id/broadcast', authAdmin, broadcastAnnouncement);
router.delete('/:id', authAdmin, deleteAnnouncement);

export default router;