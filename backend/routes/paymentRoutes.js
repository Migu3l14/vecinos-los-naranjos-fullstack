import express from 'express';
import expressRaw from 'express';
import WompiService from '../services/wompiService.js';
import WompiConfig from '../config/wompi.js';
import Storage from '../db/storage.js';
import { hasRealWompi } from '../config/env.js';
import { WhatsAppService } from '../services/whatsappService.js';

const router = express.Router();

// Auxiliares de membresía (activación por 30 días)
const activateMembership = (businessId, paymentMethod, payerData = {}) => {
  const businesses = Storage.read('businesses');
  const index = businesses.findIndex(b => b.id === businessId);
  if (index === -1) return null;

  const business = businesses[index];
  const now = new Date();
  let baseTime = now.getTime();

  if (business.status === 'active' && business.expiresAt && new Date(business.expiresAt) > now) {
    baseTime = new Date(business.expiresAt).getTime();
  }
  const expirationDate = new Date(baseTime + (30 * 24 * 60 * 60 * 1000));

  business.status = 'active';
  business.activatedAt = now.toISOString();
  business.expiresAt = expirationDate.toISOString();
  business.pausedReason = null;
  business.daysRemaining = 30;

  Storage.write('businesses', businesses);

  const receiptId = `REC-LN-${Date.now().toString().slice(-6)}`;
  const transactionId = `TRX-${Math.floor(100000 + Math.random() * 900000)}`;
  const receipt = {
    receiptId,
    transactionId,
    businessId: business.id,
    businessName: business.name,
    manzana: business.manzana,
    phone: business.phone,
    payerName: payerData.payerName || business.name,
    payerPhone: payerData.payerPhone || business.phone,
    payerEmail: payerData.payerEmail || 'vecino@losnaranjos.com',
    concept: 'Membresía Mensual (30 días) — Vitrina Digital Los Naranjos',
    amountCOP: WompiConfig.membershipAmountCOP,
    currency: 'COP',
    paymentMethod: paymentMethod,
    paymentDate: now.toISOString(),
    coverageStartDate: now.toISOString(),
    coverageEndDate: expirationDate.toISOString(),
    durationDays: 30,
    status: 'Aprobado y Activo',
    verificationCode: `VDLN-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
  };
  Storage.insert('receipts', receipt);

  WhatsAppService.sendAutomatedReceipt(receipt);

  return { business, receipt };
};

// POST /api/payments/wompi-checkout
// Prepara una transacción Wompi para el Widget Checkout.
// - Con llaves: devuelve publicKey + signature para abrir el widget real.
// - Sin llaves: devuelve widgetActive=false para que el frontend use el
//   fallback simulado (compatible con desarrollo / hosting sin configurar).
router.post('/wompi-checkout', (req, res) => {
  try {
    const { businessId, payerName, payerPhone, payerEmail } = req.body;
    if (!businessId) {
      return res.status(400).json({ success: false, message: 'El ID de la vitrina es obligatorio.' });
    }

    const businesses = Storage.read('businesses');
    const business = businesses.find(b => b.id === businessId);
    if (!business) {
      return res.status(404).json({ success: false, message: 'Vitrina no encontrada.' });
    }

    const checkout = WompiService.prepareCheckout(business, { payerName, payerPhone, payerEmail });
    res.json({ success: true, data: checkout });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al preparar el pago', error: error.message });
  }
});

// POST /api/payments/wompi-webhook
// Recibe notificaciones asíncronas de Wompi. Verifica la firma checksum.
// Body se lee en raw para poder validar el header X-Event-Checksum.
router.post('/wompi-webhook', expressRaw.json({ type: 'application/json' }), (req, res) => {
  try {
    const event = req.body;

    // Verificación de integridad de la firma (si el evento trae signature)
    if (hasRealWompi && event?.signature?.checksum) {
      const check = WompiService.verifyEventChecksum(event);
      if (!check.valid) {
        console.warn('[WOMPI WEBHOOK] Firma inválida, evento ignorado.');
        return res.status(401).json({ received: false, reason: 'invalid_checksum' });
      }
    } else if (hasRealWompi) {
      // En modo real se exige firma (para evitar suplantación). Sin firma -> rechazar.
      return res.status(401).json({ received: false, reason: 'missing_signature' });
    }

    // Solo procesamos eventos de transacción actualizada
    if (event?.event === 'transaction.updated' && event.data?.transaction) {
      const trx = event.data.transaction;
      const { reference, status, id, payment_method_type } = trx;

      // Actualizar transacción local (con idempotencia por referencia/wompiId)
      const tx = WompiService.updateTransaction({
        reference,
        wompiTransactionId: id,
        status,
        paymentMethod: payment_method_type,
        event: { event: event.event, status },
      });

      switch (status) {
        case 'APPROVED': {
          // Localizar negocio por referencia (o por el businessId registrado en la transacción)
          const businessId = tx.businessId || (reference ? reference.replace(/^LN-/, '').split('-')[0] : null);
          if (businessId) {
            const result = activateMembership(businessId, payment_method_type || 'Nequi / Wompi', {
              payerName: tx.payerName,
              payerPhone: tx.payerPhone,
              payerEmail: tx.payerEmail,
            });
            console.log(`[WOMPI WEBHOOK] Pago APROBADO: vitrina ${businessId} activada (ref ${reference}).`);
            if (result) console.log(`[WOMPI WEBHOOK] Recibo ${result.receipt.receiptId} generado y enviado.`);
          } else {
            console.warn('[WOMPI WEBHOOK] No se pudo resolver businessId para la referencia', reference);
          }
          break;
        }
        case 'DECLINED':
          console.log(`[WOMPI WEBHOOK] Pago DECLINED (rechazado): ref ${reference}.`);
          break;
        case 'VOIDED':
          console.log(`[WOMPI WEBHOOK] Pago VOIDED (anulado): ref ${reference}.`);
          break;
        case 'PENDING':
          console.log(`[WOMPI WEBHOOK] Transacción PENDING: ref ${reference}.`);
          break;
        default:
          console.log(`[WOMPI WEBHOOK] Estado desconocido '${status}' para ref ${reference}.`);
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('[WOMPI WEBHOOK] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/payments/receipt-by-business/:businessId
// Obtiene el recibo aprobado más reciente de un negocio (tras pago exitoso).
router.get('/receipt-by-business/:businessId', (req, res) => {
  try {
    const { businessId } = req.params;
    const receipts = Storage.read('receipts');
    const receipt = receipts
      .filter(r => r.businessId === businessId)
      .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate))[0] || null;
    if (!receipt) {
      return res.status(404).json({ success: false, message: 'Sin recibo aprobado aún.' });
    }
    res.json({ success: true, data: receipt });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al consultar recibo', error: error.message });
  }
});

// GET /api/payments/transaction/:id
// Consulta el estado de una transacción local (pago) en tiempo real.
router.get('/transaction/:id', (req, res) => {
  try {
    const { id } = req.params;
    const transaction = WompiService.getTransaction(id);
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transacción no encontrada.' });
    }
    res.json({ success: true, data: transaction });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al consultar transacción', error: error.message });
  }
});

export default router;
