import express from 'express';
import {
  createPqrs,
  getAllPqrs,
  updatePqrsStatus,
  addPqrsNote
} from '../controllers/pqrsController.js';
import { authSuperAdmin } from '../middleware/auth.js';

const router = express.Router();

// POST /api/pqrs (público) — residente radica una PQRS
router.post('/', createPqrs);

// Rutas protegidas: solo el Super Administrador gestiona PQRS
// GET /api/pqrs — listar (con filtro opcional ?estado= / ?tipo=)
router.get('/', authSuperAdmin, getAllPqrs);

// PUT /api/pqrs/:id/status — cambiar estado
router.put('/:id/status', authSuperAdmin, updatePqrsStatus);

// POST /api/pqrs/:id/notes — agregar nota de seguimiento
router.post('/:id/notes', authSuperAdmin, addPqrsNote);

export default router;
