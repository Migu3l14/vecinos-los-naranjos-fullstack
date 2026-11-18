import express from 'express';
import {
  createOrder,
  getAllOrders,
  getMyOrders,
  getMyPurchases,
  updateMyOrderStatus,
  updateOrderStatus
} from '../controllers/orderController.js';
import { authResident, authSuperAdmin, optionalAuthResident } from '../middleware/auth.js';

const router = express.Router();

// POST /api/orders (público o residente autenticado) — crea pedido tras capturar
// identidad. Con token válido se usa el perfil guardado en el servidor.
router.post('/', optionalAuthResident, createOrder);

// Rutas del vendedor (residente autenticado): solo sus propias vitrinas
// GET /api/orders/mine — pedidos de mis vitrinas (filtro ?estado=)
router.get('/mine', authResident, getMyOrders);

// GET /api/orders/my-purchases — pedidos del comprador autenticado
router.get('/my-purchases', authResident, getMyPurchases);

// PUT /api/orders/mine/:id/status — actualizar estado de un pedido propio
router.put('/mine/:id/status', authResident, updateMyOrderStatus);

// Rutas protegidas: solo el Super Administrador gestiona pedidos
// GET /api/orders — listar pedidos (filtro ?estado=)
router.get('/', authSuperAdmin, getAllOrders);

// PUT /api/orders/:id/status — actualizar estado del pedido
router.put('/:id/status', authSuperAdmin, updateOrderStatus);

export default router;
