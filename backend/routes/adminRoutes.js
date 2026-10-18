import express from 'express';
import { exportAllData } from '../controllers/exportController.js';
import { authSuperAdmin } from '../middleware/auth.js';

const router = express.Router();

// GET /api/admin/export (solo super admin) — descarga completa de datos (JSON)
// Permite respaldar toda la información registrada y migrarla a una base de datos.
router.get('/export', authSuperAdmin, exportAllData);

export default router;
