import express from 'express';
import {
  createPqrs,
  getAllPqrs,
  updatePqrsStatus,
  addPqrsNote
} from '../controllers/pqrsController.js';
import { authAdmin } from '../middleware/auth.js';

const router = express.Router();

// POST /api/pqrs (público) — residente radica una PQRS
router.post('/', createPqrs);

// Rutas protegidas con rol admin
// GET /api/pqrs — listar (con filtro opcional ?estado= / ?tipo=)
router.get('/', authAdmin, getAllPqrs);

// PUT /api/pqrs/:id/status — cambiar estado
router.put('/:id/status', authAdmin, updatePqrsStatus);

// POST /api/pqrs/:id/notes — agregar nota de seguimiento
router.post('/:id/notes', authAdmin, addPqrsNote);

export default router;
