import express from 'express';
import {
  processSubscriptionPayment,
  getReceiptById,
  handleWompiWebhook
} from '../controllers/subscriptionController.js';
import { authAny } from '../middleware/auth.js';

const router = express.Router();

// POST /api/subscriptions/checkout (Pagar y Activar)
router.post('/checkout', processSubscriptionPayment);

// POST /api/subscriptions/webhook-wompi (Webhook automático de Wompi / Bancolombia / Nequi)
router.post('/webhook-wompi', handleWompiWebhook);

// GET /api/subscriptions/receipt/:id (Consultar Recibo Digital)
// Requiere sesión: solo el dueño de la vitrina o un administrador.
router.get('/receipt/:id', authAny, getReceiptById);

export default router;
