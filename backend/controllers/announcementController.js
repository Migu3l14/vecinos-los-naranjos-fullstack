import Storage from '../db/storage.js';
import { normalizePhone, towerToManzana } from '../utils/manzana.js';
import { WhatsAppService } from '../services/whatsappService.js';
import ENV from '../config/env.js';

const MANZANAS = ['1', '2', '3', '4', '5', '6'];

// POST /api/announcements (admin) — crear y publicar un comunicado
export const createAnnouncement = async (req, res) => {
  try {
    const adminManzana = req.user && req.user.manzana;
    const manzanaParam = String(req.body.manzana || '').trim();
    // El administrador de manzana solo publica en la suya; el global elige
    const manzana = adminManzana || manzanaParam;

    if (!MANZANAS.includes(String(manzana))) {
      return res.status(400).json({ success: false, message: 'Elige una manzana válida (1 a 6).' });
    }
    if (!req.body.title || !String(req.body.title).trim()) {
      return res.status(400).json({ success: false, message: 'El título del comunicado es obligatorio.' });
    }

    const mediaUrl = String(req.body.mediaUrl || '').trim();
    const kind = String(req.body.kind || '');
    const anuncio = {
      id: `ann-${Date.now()}`,
      manzana: String(manzana),
      title: String(req.body.title).trim().slice(0, 160),
      body: String(req.body.body || '').trim().slice(0, 5000),
      kind: ['image', 'pdf', 'text'].includes(kind)
        ? kind
        : (mediaUrl && /\.pdf($|\?)/i.test(mediaUrl) ? 'pdf' : (mediaUrl ? 'image' : 'text')),
      mediaUrl: mediaUrl || '',
      status: 'published',
      recipientsCount: 0,
      broadcastSent: false,
      publishedBy: (req.user && req.user.phone) || 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await Storage.insert('announcements', anuncio);

    // Envío masivo por WhatsApp a los residentes de esa manzana (si se pidió)
    if (req.body.sendWhatsApp === true || req.body.sendWhatsApp === 'true') {
      await runBroadcast(anuncio);
    }

    const final = await Storage.findById('announcements', anuncio.id);
    res.status(201).json({ success: true, message: 'Comunicado publicado.', data: final });
  } catch (error) {
    console.error('[ANNOUNCEMENT] Error al crear:', error.message);
    res.status(500).json({ success: false, message: 'Error al publicar el comunicado', error: error.message });
  }
};

// GET /api/announcements (público) — solo publicados, segmentado por manzana
export const getPublicAnnouncements = async (req, res) => {
  try {
    const { manzana } = req.query;
    let items = await Storage.read('announcements');
    items = items.filter(a => a.status === 'published');
    if (manzana && manzana !== 'all') {
      items = items.filter(a => String(a.manzana) === String(manzana));
    }
    items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    res.json({ success: true, count: items.length, data: items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al consultar comunicados', error: error.message });
  }
};

// GET /api/announcements/admin (authAdmin) — los de la manzana del admin
export const getAdminAnnouncements = async (req, res) => {
  try {
    const adminManzana = req.user && req.user.manzana;
    let items = await Storage.read('announcements');
    if (adminManzana) {
      items = items.filter(a => String(a.manzana) === String(adminManzana));
    }
    items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    res.json({ success: true, count: items.length, data: items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al consultar comunicados', error: error.message });
  }
};

// DELETE /api/announcements/:id (authAdmin)
export const deleteAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const adminManzana = req.user && req.user.manzana;
    let items = await Storage.read('announcements');
    const target = items.find(a => a.id === id);

    if (!target) return res.status(404).json({ success: false, message: 'Comunicado no encontrado.' });
    if (adminManzana && String(target.manzana) !== String(adminManzana)) {
      return res.status(403).json({ success: false, message: 'Solo puedes eliminar comunicados de tu manzana.' });
    }

    items = items.filter(a => a.id !== id);
    await Storage.write('announcements', items);
    res.json({ success: true, message: 'Comunicado eliminado.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al eliminar el comunicado', error: error.message });
  }
};

// POST /api/announcements/:id/broadcast (authAdmin) — reenviar por WhatsApp
export const broadcastAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const adminManzana = req.user && req.user.manzana;
    const anuncio = await Storage.findById('announcements', id);

    if (!anuncio) return res.status(404).json({ success: false, message: 'Comunicado no encontrado.' });
    if (adminManzana && String(anuncio.manzana) !== String(adminManzana)) {
      return res.status(403).json({ success: false, message: 'Solo puedes enviar comunicados de tu manzana.' });
    }

    const result = await runBroadcast(anuncio);
    const final = await Storage.findById('announcements', id);
    res.json({ success: true, message: `Enviado a ${result.phones} residentes de la manzana ${anuncio.manzana}.`, data: final });
  } catch (error) {
    console.error('[ANNOUNCEMENT] Error en broadcast:', error.message);
    res.status(500).json({ success: false, message: 'Error al enviar el comunicado', error: error.message });
  }
};

// GET /api/announcements/recipients/count?manzana=N (authAdmin) — preview antes de publicar
export const getRecipientsCount = async (req, res) => {
  try {
    const adminManzana = req.user && req.user.manzana;
    const manzana = adminManzana || String(req.query.manzana || '');
    const residents = (await Storage.read('residents')) || [];
    const phones = new Set();
    for (const r of residents) {
      const mz = await towerToManzana(r.towerId);
      if (mz === String(manzana)) {
        const p = normalizePhone(r.phone);
        if (p) phones.add(p);
      }
    }
    res.json({ success: true, data: { manzana: String(manzana), count: phones.size } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al contar destinatarios', error: error.message });
  }
};

// ---------- Interno: envío masivo ----------
const buildBroadcastText = (ann) => {
  const fecha = new Date(ann.createdAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' });
  return [
    '🛡️ *COMUNICADO OFICIAL*',
    `🍊 Vitrina Digital Los Naranjos · Manzana ${ann.manzana}`,
    '',
    `*${ann.title}*`,
    '',
    ann.body || '',
    '',
    `📅 ${fecha}`,
    ann.mediaUrl ? `🔗 Ver adjunto: ${ENV.APP_URL}${ann.mediaUrl}` : ''
  ].filter(Boolean).join('\n');
};

const runBroadcast = async (ann) => {
  const residents = (await Storage.read('residents')) || [];
  const phones = [];
  const seen = new Set();
  for (const r of residents) {
    const mz = await towerToManzana(r.towerId);
    if (mz !== ann.manzana) continue;
    const p = normalizePhone(r.phone);
    if (!p || seen.has(p)) continue;
    seen.add(p);
    phones.push(p);
  }

  const result = await WhatsAppService.sendBroadcast({
    phones,
    text: buildBroadcastText(ann),
    mediaUrl: ann.mediaUrl || '',
    mediaKind: ann.kind
  });

  await Storage.updateById('announcements', ann.id, {
    recipientsCount: phones.length,
    broadcastSent: true,
    broadcastAt: new Date().toISOString()
  });

  return { phones: phones.length, result };
};