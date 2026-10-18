import express from 'express';
import {
  createOrder,
  getAllOrders,
  updateOrderStatus
} from '../controllers/orderController.js';
import { authSuperAdmin } from '../middleware/auth.js';

const router = express.Router();

// POST /api/orders (público) — crea pedido tras capturar identidad del residente
router.post('/', createOrder);

// Rutas protegidas: solo el Super Administrador gestiona pedidos
// GET /api/orders — listar pedidos (filtro ?estado=)
router.get('/', authSuperAdmin, getAllOrders);

// PUT /api/orders/:id/status — actualizar estado del pedido
router.put('/:id/status', authSuperAdmin, updateOrderStatus);

export default router;
