import express from 'express';
import {
  getBusinesses,
  getBusinessById,
  getBusinessByPhone,
  registerBusiness,
  rateBusiness,
  updateBusiness,
  deleteBusiness,
  getMyBusinesses,
  updateMyBusiness,
  addMyProduct,
  updateMyProduct,
  deleteMyProduct
} from '../controllers/businessController.js';
import { authAdmin, authResident, optionalAuthResident } from '../middleware/auth.js';
import { cachePublic } from '../middleware/cache.js';

const router = express.Router();

// GET /api/businesses (Directorio con filtros) — público: caché corta (TTL 60s)
router.get('/', cachePublic({ maxAge: 60, sMaxAge: 300, staleWhileRevalidate: 300 }), getBusinesses);

// POST /api/businesses (Crear nueva vitrina — se vincula al dueño si hay sesión)
router.post('/', optionalAuthResident, registerBusiness);

// GET /api/businesses/manage/:phone (Consultar estado y vigencia por teléfono del dueño)
router.get('/manage/:phone', getBusinessByPhone);

// ---------- Panel del Vendedor (protegido, antes de /:id) ----------
// GET /api/businesses/mine (Mis vitrinas)
router.get('/mine', authResident, getMyBusinesses);

// PUT /api/businesses/mine/:id (Editar perfil de mi vitrina)
router.put('/mine/:id', authResident, updateMyBusiness);

// POST /api/businesses/mine/:id/products (Agregar producto)
router.post('/mine/:id/products', authResident, addMyProduct);

// PUT /api/businesses/mine/:id/products/:pid (Editar producto)
router.put('/mine/:id/products/:pid', authResident, updateMyProduct);

// DELETE /api/businesses/mine/:id/products/:pid (Eliminar producto)
router.delete('/mine/:id/products/:pid', authResident, deleteMyProduct);

// GET /api/businesses/:id (Detalle de una vitrina) — público: caché corta
router.get('/:id', cachePublic({ maxAge: 60, sMaxAge: 300, staleWhileRevalidate: 300 }), getBusinessById);

// POST /api/businesses/:id/ratings (Público) — Valorar una vitrina
router.post('/:id/ratings', rateBusiness);

// PUT /api/businesses/:id (admin) — Editar perfil de vendedor
router.put('/:id', authAdmin, updateBusiness);

// DELETE /api/businesses/:id (admin) — Eliminar perfil de vendedor
router.delete('/:id', authAdmin, deleteBusiness);

export default router;
