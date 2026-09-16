// Módulo de integración inteligente con WhatsApp

export const WhatsAppHelper = {
  // Construir mensaje para contacto general del negocio
  buildGeneralMessage(business) {
    return `Hola, vi tu perfil en la plataforma de Vecinos Los Naranjos y quisiera información de tus productos`;
  },

  // Construir mensaje general incluyendo los datos de identidad del residente (checkout dual)
  buildGeneralMessageWithResident(business, resident) {
    if (!resident) return this.buildGeneralMessage(business);
    return `Hola, vi tu perfil en la plataforma de Vecinos Los Naranjos y quisiera información de tus productos.\n\n_Nombre:_ ${resident.fullName}\n_Torre:_ ${resident.tower}\n_Apartamento:_ ${resident.apartment}\n_Teléfono:_ ${resident.phone}`;
  },

  // Construir mensaje para pedir una oferta especial
  buildOfferMessage(offer) {
    return `¡Hola ${offer.bizName}! 👋 Vi en *Vitrina Digital Los Naranjos* su oferta especial: *${offer.title}* por ${offer.price}. Vivo en Los Naranjos y me gustaría pedirla. ¿Tienen disponibilidad hoy?`;
  },

  // Construir mensaje para encargar un producto específico
  buildProductMessage(business, product) {
    return `Hola, vi tu producto ${product.name} en la plataforma de Vecinos Los Naranjos y me interesa comprarlo/pedir información`;
  },

  // Construir comprobante oficial de pago para WhatsApp con enlace a la factura digital
  buildReceiptShareMessage(receipt) {
    const fromDate = new Date(receipt.coverageStartDate).toLocaleDateString('es-CO');
    const toDate = new Date(receipt.coverageEndDate).toLocaleDateString('es-CO');
    const receiptWebUrl = `${window.location.origin}/recibo.html?id=${receipt.receiptId}`;

    return `🧾 *COMPROBANTE OFICIAL DE ACTIVACIÓN*
🍊 *Vitrina Digital Los Naranjos*
━━━━━━━━━━━━━━━━━━━━━━━━
🏢 *Vitrina:* ${receipt.businessName} (Manzana ${receipt.manzana})
📄 *Recibo N°:* ${receipt.receiptId}
💳 *Transacción:* ${receipt.transactionId}
💵 *Valor Pagado:* $${receipt.amountCOP.toLocaleString('es-CO')} COP
📅 *Vigencia:* ${fromDate} al ${toDate} (30 días)
✅ *Estado:* ${receipt.status}
🔒 *Código Verificación:* ${receipt.verificationCode}
━━━━━━━━━━━━━━━━━━━━━━━━
🌐 *Ver tu Recibo Oficial en línea:*
👉 ${receiptWebUrl}

¡Tu vitrina ya está visible y activa para toda la comunidad de Los Naranjos! 🎉`;
  },

  // Generar URL directa de wa.me
  createUrl(phone, messageText) {
    const cleanPhone = (phone || '').replace(/\D/g, '');
    const encoded = encodeURIComponent(messageText);
    return `https://wa.me/${cleanPhone}?text=${encoded}`;
  }
};
