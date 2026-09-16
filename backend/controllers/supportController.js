import ENV from '../config/env.js';
import Storage from '../db/storage.js';

// GET /api/support — canales de contacto para emprendedores.
// WhatsApp solo se expone si SUPPORT_WHATSAPP está configurado.
// El email usa SUPPORT_EMAIL si existe, si no el correo del administrador.
export const getSupportChannels = (req, res) => {
  try {
    const whatsapp = (process.env.SUPPORT_WHATSAPP || '').replace(/\D/g, '').trim();
    const email = (process.env.SUPPORT_EMAIL || ENV.ADMIN_EMAIL || '').trim();

    res.json({
      success: true,
      data: { whatsapp, email }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al consultar soporte', error: error.message });
  }
};

// POST /api/support/request (público) — el emprendedor deja su número
// para que el equipo lo contacte (sin email).
export const createSupportRequest = (req, res) => {
  try {
    const telefono = String(req.body.telefono || '').trim();
    if (!/^\d{7,15}$/.test(telefono.replace(/[^0-9]/g, ''))) {
      return res.status(400).json({ success: false, message: 'Ingresa un número de teléfono válido.' });
    }

    const request = {
      id: `sprt-${Date.now()}`,
      nombre: String(req.body.nombre || '').trim(),
      telefono: telefono,
      mensaje: String(req.body.mensaje || '').trim().slice(0, 500),
      estado: 'Nueva',
      createdAt: new Date().toISOString()
    };

    Storage.insert('supportRequests', request);
    res.status(201).json({
      success: true,
      message: '¡Listo! Te contactaremos lo antes posible.',
      data: request
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al guardar la solicitud', error: error.message });
  }
};

// GET /api/support/requests (authAdmin) — solicitudes para contactar al emprendedor
export const getSupportRequests = (req, res) => {
  try {
    const requests = Storage.read('supportRequests')
      .slice()
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    res.json({ success: true, count: requests.length, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener solicitudes de soporte', error: error.message });
  }
};