import express from 'express';
import {
  createOrder,
  getAllOrders,
  updateOrderStatus
} from '../controllers/orderController.js';
import { authAdmin } from '../middleware/auth.js';

const router = express.Router();

// POST /api/orders (público) — crea pedido tras capturar identidad del residente
router.post('/', createOrder);

// Rutas protegidas con rol admin
// GET /api/orders — listar pedidos (filtro ?estado=)
router.get('/', authAdmin, getAllOrders);

// PUT /api/orders/:id/status — actualizar estado del pedido
router.put('/:id/status', authAdmin, updateOrderStatus);

export default router;
