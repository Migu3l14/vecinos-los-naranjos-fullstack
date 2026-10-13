import express from 'express';
import {
  getOffers,
  getMyOffers,
  createOffer,
  updateOffer,
  toggleOfferStatus,
  deleteOffer
} from '../controllers/offerController.js';
import { authResident } from '../middleware/auth.js';
import { cachePublic } from '../middleware/cache.js';

const router = express.Router();

// GET /api/offers (público) — ofertas activas del día: TTL corto
router.get('/', cachePublic({ maxAge: 30, sMaxAge: 120, staleWhileRevalidate: 120 }), getOffers);

// GET /api/offers/mine (protegido) — ofertas del vendedor autenticado
router.get('/mine', authResident, getMyOffers);

// CRUD del emprendedor (protegido, verifica propiedad de la vitrina)
router.post('/', authResident, createOffer);
router.put('/:id', authResident, updateOffer);
router.put('/:id/status', authResident, toggleOfferStatus);
router.delete('/:id', authResident, deleteOffer);

export default router;