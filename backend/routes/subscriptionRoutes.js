import express from 'express';
import {
  processSubscriptionPayment,
  getReceiptById,
  handleWompiWebhook
} from '../controllers/subscriptionController.js';

const router = express.Router();

// POST /api/subscriptions/checkout (Pagar y Activar)
router.post('/checkout', processSubscriptionPayment);

// POST /api/subscriptions/webhook-wompi (Webhook automático de Wompi / Bancolombia / Nequi)
router.post('/webhook-wompi', handleWompiWebhook);

// GET /api/subscriptions/receipt/:id (Consultar Recibo Digital)
router.get('/receipt/:id', getReceiptById);

export default router;
