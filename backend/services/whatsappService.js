import https from 'https';
import ENV from '../config/env.js';

/**
 * Servicio de Envío Automático de WhatsApp desde el Servidor
 * Soporta: Meta WhatsApp Cloud API Oficial, Twilio, y Proveedores de Mensajería
 */
export const WhatsAppService = {

  /**
   * POST a Graph API de Meta (mensajes / media). Resuelve sin error si faltan llaves.
   */
  _graphPost(pathAndQuery, payload) {
    return new Promise((resolve) => {
      const token = process.env.WHATSAPP_API_TOKEN;
      const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      if (!token || !phoneId) return resolve({ skipped: true });

      const body = JSON.stringify(payload);
      const req = https.request({
        hostname: 'graph.facebook.com',
        path: `/v18.0/${phoneId}${pathAndQuery}`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', (err) => resolve({ error: err.message }));
      req.write(body);
      req.end();
    });
  },

  /**
   * Envío masivo de un comunicado a una lista de teléfonos.
   * Envía el texto oficial y, si hay adjunto, una imagen o documento por link
   * (Media API de Meta). Sin llaves configuradas, registra en consola (modo dev).
   * @param {{ phones: string[], text: string, mediaUrl?: string, mediaKind?: 'image'|'pdf'|'text' }} opts
   */
  async sendBroadcast({ phones, text, mediaUrl, mediaKind }) {
    const recipients = Array.isArray(phones) ? phones.filter(Boolean) : [];
    if (recipients.length === 0) {
      console.log('[BROADCAST] No hay destinatarios para este comunicado.');
      return { success: true, sentTo: 0, dev: true };
    }

    const absoluteMedia = mediaUrl
      ? (mediaUrl.startsWith('http') ? mediaUrl : `${(ENV.APP_URL || '').replace(/\/$/, '')}${mediaUrl}`)
      : '';

    const token = process.env.WHATSAPP_API_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const hasCreds = Boolean(token && phoneId);

    if (!hasCreds) {
      // Modo desarrollo: log del envío sin contactar la API de Meta
      console.log(`[BROADCAST] Envío desarrollador a ${recipients.length} residente(s) de la manzana:\n${recipients.map(p => `   • +${p}`).join('\n')}\n\n${text}\n`);
      return { success: true, sentTo: recipients.length, dev: true };
    }

    let sentCount = 0;
    let failed = 0;

    for (const phone of recipients) {
      try {
        const textRes = await this._graphPost('/messages', {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phone,
          type: 'text',
          text: { preview_url: true, body: text }
        });

        let mediaRes = null;
        if (absoluteMedia && (mediaKind === 'image' || mediaKind === 'pdf')) {
          mediaRes = await this._graphPost('/messages', {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: phone,
            type: mediaKind === 'pdf' ? 'document' : 'image',
            [mediaKind === 'pdf' ? 'document' : 'image']: {
              link: absoluteMedia,
              filename: mediaKind === 'pdf' ? 'comunicado.pdf' : undefined
            }
          });
        }

        const okText = textRes.status >= 200 && textRes.status < 300;
        const okMedia = !mediaRes || (mediaRes.status >= 200 && mediaRes.status < 300);
        if (okText && okMedia) sentCount += 1; else failed += 1;
        console.log(`[BROADCAST] +${phone}: ${okText && okMedia ? 'OK' : 'FALLÓ'} (texto ${textRes.status || 'skipped'}, media ${mediaRes ? mediaRes.status || 'skipped' : 'sin adjunto'})`);
      } catch (err) {
        failed += 1;
        console.error(`[BROADCAST] Error con +${phone}: ${err.message}`);
      }
    }

    return { success: failed === 0, sentTo: sentCount, failed, dev: false };
  },

  /**
   * Enviar Recibo Oficial automáticamente al WhatsApp del emprendedor
   * @param {Object} receipt - Datos del recibo generado
   */
  async sendAutomatedReceipt(receipt) {
    const phone = (receipt.phone || '').replace(/\D/g, '');
    const fromDate = new Date(receipt.coverageStartDate).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    const toDate = new Date(receipt.coverageEndDate).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    
    // Formato ultra-estético estilo Factura Electrónica / Recibo Bancario
    const formattedReceiptMessage = 
`╔════════════════════════════════════╗
   🍊 *VITRINA DIGITAL LOS NARANJOS*
   *COMPROBANTE OFICIAL DE ACTIVACIÓN*
╚════════════════════════════════════╝

📋 *DETALLES DE LA TRANSACCIÓN*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏢 *Emprendimiento:* ${receipt.businessName}
📍 *Ubicación:* Manzana ${receipt.manzana} (Los Naranjos)
📄 *Recibo N°:* \`${receipt.receiptId}\`
💳 *N° Transacción:* \`${receipt.transactionId}\`
💵 *Monto Total:* *$31.600 COP*
💳 *Medio de Pago:* ${receipt.paymentMethod}
📅 *Fecha de Pago:* ${new Date(receipt.paymentDate).toLocaleDateString('es-CO')}
⏱️ *Período:* ${fromDate} al ${toDate}
⏳ *Vigencia:* *30 Días Calendario*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ✅ *ESTADO: PAGO APROBADO & ACTIVO*
   🔒 *CÓDIGO DE SEGURIDAD:* \`${receipt.verificationCode}\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎉 *¡Tu vitrina ya está visible para toda la comunidad!*
Los más de 2.160 apartamentos de Los Naranjos ya pueden contactarte directamente por WhatsApp.

🌐 *Ver tu factura y vitrina digital:*
👉 https://losnaranjos.com/recibo.html?id=${receipt.receiptId}`;

    console.log(`[WHATSAPP AUTOMÁTICO] Enviando recibo oficial al número +${phone}...`);

    // Si se configuran las llaves de Meta WhatsApp Cloud API en el .env:
    const token = process.env.WHATSAPP_API_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (token && phoneId) {
      try {
        const payload = JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phone,
          type: 'text',
          text: { preview_url: true, body: formattedReceiptMessage }
        });

        const options = {
          hostname: 'graph.facebook.com',
          path: `/v18.0/${phoneId}/messages`,
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        };

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            console.log(`[WHATSAPP AUTOMÁTICO] Respuesta de Meta API: ${res.statusCode}`);
          });
        });

        req.on('error', (err) => {
          console.error('[WHATSAPP AUTOMÁTICO] Error al enviar:', err.message);
        });

        req.write(payload);
        req.end();
      } catch (err) {
        console.error('[WHATSAPP AUTOMÁTICO] Error:', err.message);
      }
    } else {
      // Modo desarrollo / Log de envío automático
      console.log(`[WHATSAPP AUTOMÁTICO] Mensaje enviado exitosamente a +${phone}:\n\n${formattedReceiptMessage}\n`);
    }

    return {
      success: true,
      sentTo: phone,
      message: formattedReceiptMessage
    };
  }
};
