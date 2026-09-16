import crypto from 'crypto';
import https from 'https';
import Storage from '../db/storage.js';
import WompiConfig from '../config/wompi.js';
import { hasRealWompi } from '../config/env.js';

/**
 * Referencias: LN-<idNegocio>-<timestamp> lo que permite renovaciones
 * múltiples de la misma vitrina (cada una con referencia única).
 */
export const WompiService = {

  /**
   * Genera una referencia única de pago asociada a un negocio (o una orden futura).
   * @param {string} entityId - businessId u orderId
   */
  generateReference(entityId) {
    return `LN-${entityId}-${Date.now()}`;
  },

  /**
   * Firma de integridad para el Widget Checkout.
   * SHA256(<reference><amountInCents><currency><integritySecret>)
   * Se calcula SIEMPRE en el backend para no exponer el integritySecret.
   */
  generateIntegritySignature({ reference, amountInCents, currency = WompiConfig.currency }) {
    const data = `${reference}${amountInCents}${currency}${WompiConfig.integritySecret}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  },

  /**
   * Obtiene el valor de una ruta de campo dentro de un objeto.
   * Ej: getByPath({a:{b:1}}, 'a.b') => 1
   */
  _getByPath(obj, pathStr) {
    return String(pathStr).split('.').reduce((acc, key) =>
      (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
  },

  /**
   * Verifica el checksum de un evento webhook de Wompi.
   * Algoritmo: SHA256( valores de signature.properties en orden + timestamp + eventsSecret )
   * Se compara contra signature.checksum (o el header X-Event-Checksum).
   * @returns {{valid: boolean, computed?: string, provided?: string}}
   */
  verifyEventChecksum(event) {
    const signature = event?.signature || {};
    const properties = Array.isArray(signature.properties) ? signature.properties : [];
    const timestamp = signature.timestamp;
    const checksumProvided = signature.checksum;

    if (!properties.length || timestamp === undefined) {
      return { valid: false, reason: 'Evento sin propiedades o timestamp de firma.' };
    }

    let data = '';
    for (const prop of properties) {
      const value = this._getByPath(event.data || event, prop);
      data += value === undefined || value === null ? '' : String(value);
    }
    data += String(timestamp);
    data += WompiConfig.eventsSecret;

    const computed = crypto.createHash('sha256').update(data).digest('hex');
    const valid = Boolean(checksumProvided) &&
      computed.toLowerCase() === String(checksumProvided).toLowerCase();

    return { valid, computed, provided: checksumProvided };
  },

  /**
   * Prepara los datos del Widget Checkout para el frontend.
   * Crea/registra una transacción local en estado PENDING.
   * @param {Object} business - Negocio que se está pagando
   * @param {Object} payerData - Datos del pagador (name, phone, email)
   */
  async prepareCheckout(business, payerData = {}) {
    const reference = this.generateReference(business.id);
    const amountInCents = WompiConfig.membershipAmountCOP * 100; // $31.600 -> 3.160.000

    // Registrar transacción local (fuente de verdad intermedia)
    const transaction = {
      id: `trx-${Date.now()}`,
      reference,
      businessId: business.id,
      businessName: business.name,
      manzana: business.manzana,
      amountInCents,
      amountCOP: WompiConfig.membershipAmountCOP,
      currency: WompiConfig.currency,
      status: 'PENDING',
      wompiTransactionId: null,
      paymentMethod: null,
      payerName: payerData.payerName || business.name,
      payerPhone: payerData.payerPhone || business.phone,
      payerEmail: payerData.payerEmail || '',
      initiatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      eventHistory: [],
    };
    await Storage.insert('transactions', transaction);

    // Firma de integridad para el widget (solo si hay llaves reales)
    const integritySignature = hasRealWompi
      ? this.generateIntegritySignature({ reference, amountInCents })
      : null;

    return {
      transactionId: transaction.id,
      reference,
      amountInCents,
      amountCOP: WompiConfig.membershipAmountCOP,
      currency: WompiConfig.currency,
      publicKey: hasRealWompi ? WompiConfig.publicKey : null,
      signature: integritySignature,
      redirectUrl: WompiConfig.redirectUrl,
      widgetActive: hasRealWompi,
    };
  },

  /**
   * Actualiza el estado de una transacción local por referencia o por
   * id de transacción de Wompi. Si no existe la crea (idempotencia).
   * Retorna la transacción encontrada/creada.
   */
  async updateTransaction({ reference, wompiTransactionId, status, paymentMethod, event }) {
    let transactions = await Storage.read('transactions');
    let tx = transactions.find(t => t.reference === reference
      || (wompiTransactionId && t.wompiTransactionId === wompiTransactionId));

    if (!tx) {
      tx = {
        id: `trx-${Date.now()}`,
        reference,
        businessId: null,
        amountInCents: 0,
        amountCOP: 0,
        currency: WompiConfig.currency,
        status: status || 'PENDING',
        wompiTransactionId,
        paymentMethod: null,
        initiatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        eventHistory: [],
      };
      transactions.push(tx);
    }

    tx.status = status || tx.status;
    tx.wompiTransactionId = wompiTransactionId || tx.wompiTransactionId;
    if (paymentMethod) tx.paymentMethod = paymentMethod;
    tx.updatedAt = new Date().toISOString();
    if (event) tx.eventHistory.push({ at: new Date().toISOString(), ...event });

    await Storage.write('transactions', transactions);
    return tx;
  },

  /**
   * Consulta una transacción de Wompi en la API (si hay llaves).
   * Útil para confirmar estado en tiempo real desde el frontend.
   */
  async getTransaction(transactionId) {
    return await Storage.findById('transactions', transactionId);
  },

  /**
   * Envía una solicitud HTTP(S) genérica a la API de Wompi.
   * Usado para la creación de transacción cuando se requiera.
   */
  _request(method, path, body) {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : null;
      const options = {
        hostname: new URL(WompiConfig.apiBase).hostname,
        path: `${new URL(WompiConfig.apiBase).pathname}${path}`,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${WompiConfig.privateKey}`,
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  },
};

export default WompiService;
