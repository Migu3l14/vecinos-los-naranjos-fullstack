import Storage from '../db/storage.js';
import { businessOwnedBy } from './businessController.js';
import { enforceMaxLength } from '../utils/validation.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Fecha de hoy local en formato AAAA-MM-DD (Colombia / UTC-5)
export const getTodayISODate = () => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const loadOffers = () => Storage.read('offers');
const saveOffers = (offers) => Storage.write('offers', offers);

// GET /api/offers (público) — solo ofertas ACTIVAS del día de hoy
export const getOffers = (req, res) => {
  try {
    const today = getTodayISODate();
    const offers = loadOffers()
      .filter(o => o.status === 'active' && o.date === today)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    res.json({ success: true, count: offers.length, data: offers });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener ofertas', error: error.message });
  }
};

// GET /api/offers/mine (authResident) — ofertas de mi vitrina (cualquier fecha/estado)
export const getMyOffers = (req, res) => {
  try {
    const residentId = req.user && req.user.residentId;
    if (!residentId) {
      return res.status(401).json({ success: false, message: 'Sesión de vendedor requerida.' });
    }
    const mine = loadOffers()
      .filter(o => {
        const business = Storage.read('businesses').find(b => b.id === o.bizId);
        return business && businessOwnedBy(business, residentId, req.user.phone);
      })
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    res.json({ success: true, count: mine.length, data: mine });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener tus ofertas', error: error.message });
  }
};

// Busca una oferta que pertenezca al vendedor autenticado
const findOwnedOfferIndex = (offers, offerId, reqUser) => {
  const index = offers.findIndex(o => o.id === offerId);
  if (index === -1) return -2; // no encontrada
  const business = Storage.read('businesses').find(b => b.id === offers[index].bizId);
  if (!business || !businessOwnedBy(business, reqUser.residentId, reqUser.phone)) return -1; // sin permisos
  return index;
};

// POST /api/offers (authResident) — crear oferta para mi vitrina
export const createOffer = (req, res) => {
  try {
    const residentId = req.user && req.user.residentId;
    if (!residentId) {
      return res.status(401).json({ success: false, message: 'Sesión de vendedor requerida.' });
    }
    const { bizId, title, price, oldPrice, desc, date, image } = req.body;
    if (!bizId || !title) {
      return res.status(400).json({ success: false, message: 'La oferta necesita la vitrina y un título.' });
    }
    const business = Storage.read('businesses').find(b => b.id === bizId && businessOwnedBy(b, residentId, req.user.phone));
    if (!business) {
      return res.status(404).json({ success: false, message: 'No tienes permisos sobre esta vitrina.' });
    }

    const offerDate = (date || getTodayISODate()).trim();
    if (!DATE_RE.test(offerDate)) {
      return res.status(400).json({ success: false, message: 'La fecha de la oferta no es válida (usa AAAA-MM-DD).' });
    }

    const offer = {
      id: `off-${Date.now()}`,
      bizId: business.id,
      bizName: business.name,
      title: enforceMaxLength(title, 80),
      price: String(price || '').trim() || 'A convenir',
      oldPrice: oldPrice ? String(oldPrice).trim() : '',
      desc: enforceMaxLength(desc || '', 220),
      date: offerDate,
      image: image || business.coverImage,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    Storage.insert('offers', offer);
    res.status(201).json({ success: true, message: 'Oferta publicada correctamente.', data: offer });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al crear la oferta', error: error.message });
  }
};

// PUT /api/offers/:id (authResident) — editar oferta propia
export const updateOffer = (req, res) => {
  try {
    const residentId = req.user && req.user.residentId;
    if (!residentId) {
      return res.status(401).json({ success: false, message: 'Sesión de vendedor requerida.' });
    }
    const { id } = req.params;
    const offers = loadOffers();
    const index = findOwnedOfferIndex(offers, id, req.user);
    if (index === -2) return res.status(404).json({ success: false, message: 'Oferta no encontrada.' });
    if (index === -1) return res.status(403).json({ success: false, message: 'No tienes permisos sobre esta oferta.' });

    const allowed = ['title', 'price', 'oldPrice', 'desc', 'date', 'image', 'status'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (updates.title !== undefined) updates.title = enforceMaxLength(String(updates.title), 80);
    if (updates.desc !== undefined) updates.desc = enforceMaxLength(String(updates.desc), 220);
    if (updates.date !== undefined && !DATE_RE.test(String(updates.date).trim())) {
      return res.status(400).json({ success: false, message: 'La fecha de la oferta no es válida (usa AAAA-MM-DD).' });
    }
    if (updates.status !== undefined && !['active', 'inactive'].includes(updates.status)) {
      return res.status(400).json({ success: false, message: 'Estado inválido.' });
    }
    if (updates.price !== undefined) updates.price = String(updates.price).trim() || 'A convenir';

    const updated = { ...offers[index], ...updates, updatedAt: new Date().toISOString() };
    offers[index] = updated;
    saveOffers(offers);

    res.json({ success: true, message: 'Oferta actualizada correctamente.', data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al actualizar la oferta', error: error.message });
  }
};

// PUT /api/offers/:id/status (authResident) — activar/desactivar oferta propia
export const toggleOfferStatus = (req, res) => {
  try {
    const residentId = req.user && req.user.residentId;
    if (!residentId) {
      return res.status(401).json({ success: false, message: 'Sesión de vendedor requerida.' });
    }
    const { id } = req.params;
    const { status } = req.body;
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Estado inválido. Usa "active" o "inactive".' });
    }
    const offers = loadOffers();
    const index = findOwnedOfferIndex(offers, id, req.user);
    if (index === -2) return res.status(404).json({ success: false, message: 'Oferta no encontrada.' });
    if (index === -1) return res.status(403).json({ success: false, message: 'No tienes permisos sobre esta oferta.' });

    offers[index].status = status;
    offers[index].updatedAt = new Date().toISOString();
    saveOffers(offers);

    res.json({ success: true, message: status === 'active' ? 'Oferta activada.' : 'Oferta desactivada.', data: offers[index] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al cambiar el estado de la oferta', error: error.message });
  }
};

// DELETE /api/offers/:id (authResident) — eliminar oferta propia
export const deleteOffer = (req, res) => {
  try {
    const residentId = req.user && req.user.residentId;
    if (!residentId) {
      return res.status(401).json({ success: false, message: 'Sesión de vendedor requerida.' });
    }
    const { id } = req.params;
    const offers = loadOffers();
    const index = findOwnedOfferIndex(offers, id, req.user);
    if (index === -2) return res.status(404).json({ success: false, message: 'Oferta no encontrada.' });
    if (index === -1) return res.status(403).json({ success: false, message: 'No tienes permisos sobre esta oferta.' });

    const [removed] = offers.splice(index, 1);
    saveOffers(offers);

    res.json({ success: true, message: 'Oferta eliminada correctamente.', data: { id: removed.id } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al eliminar la oferta', error: error.message });
  }
};