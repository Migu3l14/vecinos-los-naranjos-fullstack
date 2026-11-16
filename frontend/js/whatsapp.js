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
    const lines = [`Hola${business && business.name ? ` ${business.name}` : ''}, vi en *Vitrina Digital Los Naranjos* el producto *${product.name}* y me interesa pedirlo.`];
    if (product.price) lines.push(`Precio: ${product.price}`);
    if (product.description) lines.push(`Detalle: ${product.description}`);
    return lines.join('\n');
  },

  buildProductShareText(business, product) {
    const lines = [`Hola${business && business.name ? ` ${business.name}` : ''}, vi en *Vitrina Digital Los Naranjos* el producto *${product.name}* y me interesa pedirlo.`];
    if (product.price) lines.push(`Precio: ${product.price}`);
    if (product.description) lines.push(`Detalle: ${product.description}`);
    return lines.join('\n');
  },

  async shareProductWithPhoto(business, product) {
    try {
      const image = product.photo || product.image || (business && business.coverImage) || '';
      if (!image || typeof navigator === 'undefined' || !navigator.share) return false;
      let absoluteImage = '';
      try { absoluteImage = new URL(image, window.location.origin).href; } catch { return false; }
      const res = await fetch(absoluteImage, { mode: 'cors' });
      if (!res.ok) return false;
      const blob = await res.blob();
      if (!blob || !/^image\//i.test(blob.type)) return false;
      const ext = ((blob.type.split('/')[1] || 'jpg').split(/[+.;]/)[0]) || 'jpg';
      const safeName = String(product.name || 'producto').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40) || 'producto';
      const file = new File([blob], `${safeName}.${ext}`, { type: blob.type || 'image/jpeg' });
      const data = { files: [file], text: this.buildProductShareText(business, product), title: product.name || 'Producto' };
      if (navigator.canShare && !navigator.canShare(data)) return false;
      await navigator.share(data);
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return true;
      return false;
    }
  },

  // Construir comprobante oficial de pago para WhatsApp con enlace a la factura digital
  buildReceiptShareMessage(receipt) {
    const fromDate = new Date(receipt.coverageStartDate).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });
    const toDate = new Date(receipt.coverageEndDate).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });
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
