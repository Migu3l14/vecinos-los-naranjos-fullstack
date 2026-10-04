import WompiService from '../services/wompiService.js';
import WompiConfig from '../config/wompi.js';
import Storage from '../db/storage.js';
import { hasRealWompi } from '../config/env.js';
import { WhatsAppService } from '../services/whatsappService.js';
import { businessOwnedBy } from './businessController.js';

// Función interna para activar membresía por 30 días, emitir recibo y
// ENVIAR AUTOMÁTICAMENTE POR WHATSAPP. (Usada por el fallback simulado
// y por el flujo real al llegar un webhook APPROVED.)
const activateBusinessMembership = async (businessId, paymentMethod = 'Nequi / PSE', payerData = {}) => {
  const businesses = await Storage.read('businesses');
  const businessIndex = businesses.findIndex(b => b.id === businessId);
  if (businessIndex === -1) return null;

  const business = businesses[businessIndex];
  const now = new Date();
  let startDate = now;
  let baseTime = now.getTime();

  if (business.status === 'active' && business.expiresAt && new Date(business.expiresAt) > now) {
    baseTime = new Date(business.expiresAt).getTime();
  }

  const expirationDate = new Date(baseTime + (30 * 24 * 60 * 60 * 1000));

  business.status = 'active';
  business.activatedAt = startDate.toISOString();
  business.expiresAt = expirationDate.toISOString();
  business.pausedReason = null;
  business.daysRemaining = 30;

  businesses[businessIndex] = business;
  await Storage.write('businesses', businesses);

  const receiptId = `REC-LN-${Date.now().toString().slice(-6)}`;
  const transactionId = `TRX-${Math.floor(100000 + Math.random() * 900000)}`;

  const newReceipt = {
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
    coverageStartDate: startDate.toISOString(),
    coverageEndDate: expirationDate.toISOString(),
    durationDays: 30,
    status: 'Aprobado y Activo',
    verificationCode: `VDLN-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
  };

  await Storage.insert('receipts', newReceipt);

  // Envío automático al WhatsApp del emprendedor
  WhatsAppService.sendAutomatedReceipt(newReceipt);

  return { business, receipt: newReceipt };
};

// POST /api/subscriptions/checkout
// - Si hay llaves de Wompi: NO activa de inmediato. Prepara una transacción
//   y devuelve los datos del Widget. La activación real ocurre vía webhook APPROVED.
// - Si NO hay llaves de Wompi: usa el flujo simulado actual (activa al instante)
//   para mantener compatibilidad en desarrollo / hosting sin credenciales.
export const processSubscriptionPayment = async (req, res) => {
  try {
    const { businessId, paymentMethod, payerName, payerPhone, payerEmail } = req.body;
    if (!businessId) {
      return res.status(400).json({ success: false, message: 'El ID de la vitrina es obligatorio.' });
    }

    const businesses = await Storage.read('businesses');
    const business = businesses.find(b => b.id === businessId);
    if (!business) {
      return res.status(404).json({ success: false, message: 'Vitrina no encontrada.' });
    }

    // MODO 1: Wompi real configurado -> preparar transacción (widget)
    if (hasRealWompi) {
      const checkout = await WompiService.prepareCheckout(business, { payerName, payerPhone, payerEmail });
      return res.status(200).json({
        success: true,
        message: 'Preparando pago seguro con Wompi. Completa la transacción en el widget.',
        mode: 'wompi',
        data: checkout,
      });
    }

    // MODO 2: Sin llaves -> flujo simulado (compatibilidad)
    const result = await activateBusinessMembership(businessId, paymentMethod, { payerName, payerPhone, payerEmail });
    if (!result) {
      return res.status(404).json({ success: false, message: 'Vitrina no encontrada.' });
    }
    res.status(200).json({
      success: true,
      message: '¡Pago exitoso! La vitrina ha sido activada y el recibo oficial se envió automáticamente a tu WhatsApp.',
      mode: 'simulated',
      receipt: result.receipt,
      business: result.business
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al procesar el pago', error: error.message });
  }
};

// POST /api/subscriptions/webhook-wompi
// Mantenido para compatibilidad con la ruta anterior, pero delega la lógica
// principal de verificación/activación al servicio Wompi (ver paymentRoutes).
export const handleWompiWebhook = async (req, res) => {
  try {
    const event = req.body;

    // Verificación de integridad de la firma (mismo criterio que el webhook de
    // /api/payments/wompi-webhook). Sin esto, cualquiera podría enviar un evento
    // "APPROVED" falsificado y activar una membresía de pago sin pagar nada,
    // porque los businessId son públicos en GET /api/businesses.
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

    if (event && event.event === 'transaction.updated' && event.data?.transaction) {
      const trx = event.data.transaction;
      const { reference, status, id, payment_method_type } = trx;

      const tx = await WompiService.updateTransaction({
        reference,
        wompiTransactionId: id,
        status,
        paymentMethod: payment_method_type,
        event: { event: event.event, status },
      });

      if (status === 'APPROVED') {
        const businessId = tx.businessId
          || (reference ? reference.replace(/^LN-/, '').split('-')[0] : null);
        if (businessId) {
          await activateBusinessMembership(businessId, payment_method_type || 'Nequi / Wompi', {
            payerName: tx.payerName,
            payerPhone: tx.payerPhone,
            payerEmail: tx.payerEmail,
          });
          console.log(`[WOMPI WEBHOOK] Vitrina ${businessId} activada y recibo enviado automáticamente.`);
        }
      }
    }
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error en Webhook Wompi:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET /api/subscriptions/receipt/:id
// Solo lo puede consultar quien es dueño de la vitrina o un administrador.
// Los recibos contienen nombre, teléfono y valores pagados, así que no se
// sirven a cualquier visitante que adivine el identificador.
export const getReceiptById = async (req, res) => {
  try {
    const { id } = req.params;
    const receipts = await Storage.read('receipts');
    const receipt = receipts.find(r => r.receiptId === id || r.transactionId === id);
    if (!receipt) {
      return res.status(404).json({ success: false, message: 'Recibo no encontrado.' });
    }

    // El token ya fue validado por authAny; aquí se comprueba la propiedad.
    if (req.user.role !== 'admin') {
      const businesses = await Storage.read('businesses');
      const business = businesses.find(b => b.id === receipt.businessId);
      const isOwner = businessOwnedBy(business || {}, req.user.residentId, req.user.phone);
      if (!isOwner) {
        return res.status(403).json({ success: false, message: 'No autorizado para ver este recibo.' });
      }
    }

    res.json({ success: true, data: receipt });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al consultar recibo', error: error.message });
  }
};
