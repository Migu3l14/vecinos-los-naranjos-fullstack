import Storage from '../db/storage.js';
import { validateFullName, validatePhone, enforceMaxLength } from '../utils/validation.js';

// Función auxiliar para leer y verificar vigencias (Auto-pausa a los 30 días).
// Compatibilidad: vitrinas antiguas con "pending_payment" se activan con 30 días
// gratis para no perderlas ni ocultarlas mientras se migra al flujo actual.
const loadAndValidateBusinesses = async () => {
  let businesses = await Storage.read('businesses');
  const now = new Date();
  let modified = false;

  businesses = businesses.map(biz => {
    // Migración suave: tiendas creadas antes del flujo "mes gratis" (pendientes de pago)
    // pasan a activas con 30 días desde ahora para que sean visibles y se conserven.
    if (biz.status === 'pending_payment') {
      biz.status = 'active';
      biz.activatedAt = biz.activatedAt || now.toISOString();
      biz.expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      biz.pausedReason = null;
      biz.trialUsed = true;
      biz.subscriptionPlan = biz.subscriptionPlan || 'Prueba gratis (30 días) — pago desde el mes 2';
      modified = true;
    }

    // Si la vitrina está activa pero ya pasaron los 30 días, se pausa y requiere pago
    if (biz.status === 'active' && biz.expiresAt) {
      const expirationDate = new Date(biz.expiresAt);
      if (expirationDate < now) {
        biz.status = 'paused';
        biz.pausedReason = 'Tu mes gratis terminó. Realiza el pago para reactivar tu vitrina.';
        biz.daysRemaining = 0;
        modified = true;
      }
    }
    // Calcular días restantes de vigencia
    if (biz.expiresAt) {
      const diffTime = new Date(biz.expiresAt) - now;
      biz.daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    } else {
      biz.daysRemaining = 0;
    }
    return biz;
  });

  if (modified) {
    await Storage.write('businesses', businesses);
  }

  return businesses;
};

// Guardar negocios
const saveBusinesses = async (businesses) => {
  await Storage.write('businesses', businesses);
};

// Normaliza teléfonos para comparar (10 dígitos => prefijo Colombia 57)
export const normalizePhone = (value) => {
  let clean = String(value || '').replace(/\D/g, '');
  if (clean.length === 10) clean = `57${clean}`;
  return clean;
};

// ¿Este negocio le pertenece al residente? (por su ownerResidentId o por su
// teléfono, para que las vitrinas creadas sin cuenta también sean gestionables
// tras la verificación del número con el código OTP).
export const businessOwnedBy = (business, residentId, phone) => {
  if (business.ownerResidentId && residentId && String(business.ownerResidentId) === String(residentId)) return true;
  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone) return false;
  return normalizePhone(business.ownerPhone) === cleanPhone || normalizePhone(business.phone) === cleanPhone;
};

// GET /api/businesses (Directorio público: Solo vitrinas activas)
export const getBusinesses = async (req, res) => {
  try {
    const { category, manzana, q, includeAll, includeProducts } = req.query;
    let businesses = await loadAndValidateBusinesses();

    // Por defecto el público solo ve vitrinas activas
    if (includeAll !== 'true') {
      businesses = businesses.filter(b => b.status === 'active');
    }

    // Filtro por categoría
    if (category && category !== 'all') {
      businesses = businesses.filter(b => b.category === category);
    }

    // Filtro por Manzana (1 a 6)
    if (manzana && manzana !== 'all') {
      businesses = businesses.filter(b => b.manzana === manzana);
    }

    // Filtro por necesidad / término de búsqueda
    if (q && q.trim() !== '') {
      const query = q.toLowerCase();
      businesses = businesses.filter(b => {
        const nameMatch = b.name.toLowerCase().includes(query);
        const descMatch = b.shortDesc.toLowerCase().includes(query) || b.fullDesc.toLowerCase().includes(query);
        const keywordMatch = b.keywords && b.keywords.some(k => k.toLowerCase().includes(query));
        const productMatch = b.products && b.products.some(p => p.name.toLowerCase().includes(query));
        return nameMatch || descMatch || keywordMatch || productMatch;
      });
    }

    const data = includeProducts === 'false'
      ? businesses.map((biz) => {
        const { products, ...rest } = biz;
        return { ...rest, productsCount: Array.isArray(products) ? products.length : 0 };
      })
      : businesses;

    res.json({
      success: true,
      count: data.length,
      data
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al consultar vitrinas', error: error.message });
  }
};

// GET /api/businesses/:id
export const getBusinessById = async (req, res) => {
  try {
    const { id } = req.params;
    const businesses = await loadAndValidateBusinesses();
    const business = businesses.find(b => b.id === id);

    if (!business) {
      return res.status(404).json({ success: false, message: 'Vitrina no encontrada' });
    }

    res.json({ success: true, data: business });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al consultar la vitrina', error: error.message });
  }
};

// GET /api/businesses/manage/:phone (Buscar vitrina por WhatsApp para consultar estado / renovar)
export const getBusinessByPhone = async (req, res) => {
  try {
    let { phone } = req.params;
    phone = phone.replace(/\D/g, ''); // Limpiar caracteres no numéricos
    const businesses = await loadAndValidateBusinesses();
    
    // Buscar coincidencia en los últimos 10 dígitos o con código de país
    const business = businesses.find(b => {
      const cleanBizPhone = (b.phone || '').replace(/\D/g, '');
      return cleanBizPhone.endsWith(phone) || phone.endsWith(cleanBizPhone);
    });

    if (!business) {
      return res.status(404).json({ success: false, message: 'No se encontró una vitrina asociada a este número.' });
    }

    res.json({ success: true, data: business });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al buscar la vitrina', error: error.message });
  }
};

// POST /api/businesses/:id/ratings (público) — Clientes valoran la vitrina
export const rateBusiness = async (req, res) => {
  try {
    const { id } = req.params;
    const stars = Math.round(Number(req.body.stars));
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      return res.status(400).json({ success: false, message: 'La calificación debe ser un número entre 1 y 5 estrellas.' });
    }

    const businesses = await loadAndValidateBusinesses();
    const index = businesses.findIndex(b => b.id === id);
    if (index === -1) return res.status(404).json({ success: false, message: 'Vitrina no encontrada.' });

    const biz = businesses[index];
    const author = enforceMaxLength(
      String(req.body.author || '').trim() || 'Vecino de Los Naranjos', 60
    );
    const comment = enforceMaxLength(String(req.body.comment || '').trim(), 240);

    const ratings = Array.isArray(biz.ratings) ? biz.ratings : [];
    // Si el mismo autor ya valoró, se actualiza su valoración (evita spam repetido)
    const previousIndex = ratings.findIndex(r => String(r.author).toLowerCase() === author.toLowerCase());
    const ratingRecord = {
      id: `r-${Date.now()}`,
      stars,
      author,
      comment,
      createdAt: new Date().toISOString()
    };
    if (previousIndex !== -1) ratings[previousIndex] = ratingRecord;
    else ratings.push(ratingRecord);

    const avg = ratings.reduce((s, r) => s + r.stars, 0) / ratings.length;
    biz.ratings = ratings;
    biz.rating = avg.toFixed(1);
    biz.ratingCount = ratings.length;
    biz.reviewsCount = ratings.length;
    biz.updatedAt = new Date().toISOString();

    businesses[index] = biz;
    await saveBusinesses(businesses);

    res.json({
      success: true,
      message: '¡Gracias por valorar esta vitrina!',
      data: { rating: biz.rating, ratingCount: biz.ratingCount }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al guardar la valoración', error: error.message });
  }
};

// POST /api/businesses/register (Crear vitrina y dejar lista para activación)
export const registerBusiness = async (req, res) => {
  try {
    const {
      name,
      category,
      manzana,
      phone,
      shortDesc,
      fullDesc,
      hours,
      delivery,
      coverImage,
      coverImageOriginal,
      coverImageCrop,
      products,
      instagram,
      facebook
    } = req.body;

    // Vincular al dueño si viene de una sesión de residente autenticado (modelo único Residente/Vendedor)
    const ownerResidentId = req.user && req.user.residentId ? req.user.residentId : null;

    if (!name || !phone || !manzana || !category) {
      return res.status(400).json({
        success: false,
        message: 'Nombre, WhatsApp, Manzana y Categoría son campos requeridos.'
      });
    }

    // Formatear teléfono a estándar Colombia 57
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length === 10) {
      cleanPhone = `57${cleanPhone}`;
    }

    const businesses = await loadAndValidateBusinesses();
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const newBusiness = {
      id: `biz-${Date.now()}`,
      name: enforceMaxLength(name, 80),
      category: String(category).toLowerCase(),
      keywords: [enforceMaxLength(name, 80).toLowerCase(), String(category).toLowerCase()],
      manzana: String(manzana),
      rating: '5.0',
      reviewsCount: 1,
      phone: cleanPhone,
      ownerResidentId: ownerResidentId || null,
      ownerPhone: cleanPhone,
      badge: 'Nuevo · Mes gratis',
      coverImage: coverImage || 'https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=800&q=80',
      coverImageOriginal: coverImageOriginal || null,
      coverImageCrop: normalizeCrop(coverImageCrop),
      shortDesc: enforceMaxLength(shortDesc || `Emprendimiento de la Manzana ${manzana} en Los Naranjos.`, 120),
      fullDesc: enforceMaxLength(fullDesc || `Somos vecinos de la Manzana ${manzana}. Ofrecemos productos y servicios de calidad para toda la comunidad de Los Naranjos.`, 500),
      hours: enforceMaxLength(hours || 'Lunes a Sábado: 8:00 AM - 7:00 PM', 120),
      delivery: enforceMaxLength(delivery || 'Entrega en tu torre / portería', 120),
      instagram: sanitizeSocial(instagram),
      facebook: sanitizeSocial(facebook),
      status: 'active',
      subscriptionPlan: 'Prueba gratis (30 días) — pago desde el mes 2',
      monthlyFee: 31600,
      trialUsed: true,
      trialEndsAt: trialEndsAt.toISOString(),
      createdAt: now.toISOString(),
      activatedAt: now.toISOString(),
      expiresAt: trialEndsAt.toISOString(),
      daysRemaining: 30,
      pausedReason: null,
      products: normalizeProducts(Array.isArray(products) && products.length > 0 ? products : [
        {
          name: 'Producto / Servicio Principal',
          price: '$20.000',
          image: coverImage || 'https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=300&q=80'
        }
      ])
    };

    businesses.push(newBusiness);
    await saveBusinesses(businesses);

    res.status(201).json({
      success: true,
      message: '¡Vitrina creada y activa! Tienes 1 mes gratis. Desde el segundo mes deberás realizar el pago para mantenerla visible.',
      data: newBusiness
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al registrar la vitrina', error: error.message });
  }
};

// Normaliza un valor de red social a una URL completa (o vacío)
const sanitizeSocial = (value) => {
  if (!value) return null;
  const v = String(value).trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^@/.test(v)) return `https://www.instagram.com/${v.slice(1)}`;
  if (/^https?/i.test(v)) return v;
  return v;
};

const clampNumber = (value, min, max, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

// Metadatos de encuadre: solo números acotados, nunca objetos arbitrarios.
const normalizeCrop = (crop) => {
  if (!crop || typeof crop !== 'object' || Array.isArray(crop)) return null;
  return {
    aspect: clampNumber(crop.aspect, 0.25, 4, 1),
    zoom: clampNumber(crop.zoom, 1, 5, 1),
    cx: clampNumber(crop.cx, 0, 1, 0.5),
    cy: clampNumber(crop.cy, 0, 1, 0.5),
    sourceWidth: Math.round(clampNumber(crop.sourceWidth, 0, 20000, 0)),
    sourceHeight: Math.round(clampNumber(crop.sourceHeight, 0, 20000, 0)),
    outputWidth: Math.round(clampNumber(crop.outputWidth, 0, 5000, 0)),
    outputHeight: Math.round(clampNumber(crop.outputHeight, 0, 5000, 0))
  };
};

// Normaliza un producto al formato enriquecido (retrocompatible con {name, price, image})
const normalizeProduct = (p, index = 0) => ({
  id: String(p.id || `p-${Date.now()}-${index}`),
  name: String(p.name || 'Producto / Servicio'),
  description: String(p.description || p.desc || ''),
  photo: String(p.photo || p.image || ''),
  photoOriginal: String(p.photoOriginal || ''),
  photoCrop: normalizeCrop(p.photoCrop),
  price: String(p.price || ''),
  category: String(p.category || 'General'),
  availability: ['activo', 'agotado'].includes(p.availability) ? p.availability : 'activo'
});

const normalizeProducts = (products) => {
  if (!Array.isArray(products)) return [];
  return products.map((p, i) => normalizeProduct(p, i));
};

// Devuelve las vitrinas propiedad de un residente (modelo único Residente/Vendedor)
export const findOwnedBusinesses = async (reqUser) => {
  const residentId = reqUser && reqUser.residentId;
  const phone = reqUser && reqUser.phone;
  const businesses = await loadAndValidateBusinesses();
  return businesses.filter(b => businessOwnedBy(b, residentId, phone));
};

// PUT /api/businesses/:id (admin) — Editar perfil de vendedor
export const updateBusiness = async (req, res) => {
  try {
    const { id } = req.params;
    const businesses = await loadAndValidateBusinesses();
    const index = businesses.findIndex(b => b.id === id);

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'No se encontró la vitrina.' });
    }

    const current = businesses[index];
    const allowed = [
      'name', 'category', 'manzana', 'phone', 'shortDesc', 'fullDesc',
      'hours', 'delivery', 'coverImage', 'coverImageOriginal', 'coverImageCrop',
      'instagram', 'facebook', 'products', 'status'
    ];

    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (updates.instagram !== undefined) updates.instagram = sanitizeSocial(updates.instagram);
    if (updates.facebook !== undefined) updates.facebook = sanitizeSocial(updates.facebook);
    if (updates.category !== undefined) updates.category = String(updates.category).toLowerCase();
    if (updates.phone !== undefined) {
      let cleanPhone = String(updates.phone).replace(/\D/g, '');
      if (cleanPhone.length === 10) cleanPhone = `57${cleanPhone}`;
      updates.phone = cleanPhone;
    }
    if (updates.products !== undefined && !Array.isArray(updates.products)) {
      return res.status(400).json({ success: false, message: 'El campo products debe ser una lista.' });
    }
    if (updates.products !== undefined) updates.products = normalizeProducts(updates.products);
    if (updates.coverImageCrop !== undefined) updates.coverImageCrop = normalizeCrop(updates.coverImageCrop);

    const updated = { ...current, ...updates, updatedAt: new Date().toISOString() };
    businesses[index] = updated;
    await saveBusinesses(businesses);

    res.json({ success: true, message: 'Vitrina actualizada correctamente.', data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al actualizar la vitrina', error: error.message });
  }
};

// DELETE /api/businesses/:id (admin) — Eliminar perfil de vendedor
export const deleteBusiness = async (req, res) => {
  try {
    const { id } = req.params;
    const businesses = await loadAndValidateBusinesses();
    const index = businesses.findIndex(b => b.id === id);

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'No se encontró la vitrina.' });
    }

    const [removed] = businesses.splice(index, 1);
    await saveBusinesses(businesses);

    // Cascada: al eliminar la vitrina se eliminan sus ofertas (promociones) para
    // que no queden huérfanas y visibles en el home ("Ofertas del día").
    // El historial (pedidos, recibos/pagos, valoraciones) se conserva.
    const offers = await Storage.read('offers');
    if (Array.isArray(offers) && offers.length) {
      const remaining = offers.filter(o => o.bizId !== removed.id);
      if (remaining.length !== offers.length) {
        await Storage.write('offers', remaining);
      }
    }

    res.json({ success: true, message: 'Vitrina eliminada correctamente.', data: { id: removed.id } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al eliminar la vitrina', error: error.message });
  }
};

// GET /api/businesses/mine (authResident) — Mis vitrinas
export const getMyBusinesses = async (req, res) => {
  try {
    const residentId = req.user && req.user.residentId;
    if (!residentId) {
      return res.status(401).json({ success: false, message: 'Sesión de residente requerida.' });
    }
    const mine = await findOwnedBusinesses(req.user);
    res.json({ success: true, count: mine.length, data: mine });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al consultar tus vitrinas', error: error.message });
  }
};

// PUT /api/businesses/mine/:id (authResident) — Editar perfil de mi vitrina
export const updateMyBusiness = async (req, res) => {
  try {
    const residentId = req.user && req.user.residentId;
    if (!residentId) {
      return res.status(401).json({ success: false, message: 'Sesión de residente requerida.' });
    }
    const { id } = req.params;
    const businesses = await loadAndValidateBusinesses();
    const index = businesses.findIndex(b => b.id === id && businessOwnedBy(b, residentId, req.user.phone));

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'No se encontró tu vitrina o no tienes permisos sobre ella.' });
    }

    const allowed = [
      'name', 'category', 'manzana', 'phone', 'shortDesc', 'fullDesc',
      'hours', 'delivery', 'coverImage', 'coverImageOriginal', 'coverImageCrop',
      'instagram', 'facebook'
    ];

    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (updates.instagram !== undefined) updates.instagram = sanitizeSocial(updates.instagram);
    if (updates.facebook !== undefined) updates.facebook = sanitizeSocial(updates.facebook);
    if (updates.category !== undefined) updates.category = String(updates.category).toLowerCase();
    if (updates.phone !== undefined) {
      let cleanPhone = String(updates.phone).replace(/\D/g, '');
      if (cleanPhone.length === 10) cleanPhone = `57${cleanPhone}`;
      updates.phone = cleanPhone;
      updates.ownerPhone = cleanPhone;
    }
    if (updates.coverImageCrop !== undefined) updates.coverImageCrop = normalizeCrop(updates.coverImageCrop);

    // La vitrina queda siempre vinculada al residente autenticado (aunque cambie
    // el número), para que nunca pierda el acceso a su propio panel.
    updates.ownerResidentId = residentId;

    const updated = { ...businesses[index], ...updates, updatedAt: new Date().toISOString() };
    businesses[index] = updated;
    await saveBusinesses(businesses);

    // Si cambió el número, se actualiza también la cuenta del dueño (residents)
    // para que él vea y use el número nuevo al ingresar.
    if (updates.phone !== undefined) {
      await Storage.updateById('residents', residentId, { phone: updates.phone });
    }

    res.json({ success: true, message: 'Vitrina actualizada correctamente.', data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al actualizar la vitrina', error: error.message });
  }
};

// POST /api/businesses/mine/:id/products (authResident) — Agregar producto
export const addMyProduct = async (req, res) => {
  try {
    const residentId = req.user && req.user.residentId;
    if (!residentId) {
      return res.status(401).json({ success: false, message: 'Sesión de residente requerida.' });
    }
    const { id } = req.params;
    const businesses = await loadAndValidateBusinesses();
    const index = businesses.findIndex(b => b.id === id && businessOwnedBy(b, residentId, req.user.phone));

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'No se encontró tu vitrina o no tienes permisos sobre ella.' });
    }

    const product = normalizeProduct(req.body, businesses[index].products.length);
    if (!product.name || !product.price) {
      return res.status(400).json({ success: false, message: 'Nombre y precio del producto son requeridos.' });
    }

    businesses[index].products.push(product);
    businesses[index].updatedAt = new Date().toISOString();
    await saveBusinesses(businesses);

    res.status(201).json({ success: true, message: 'Producto agregado correctamente.', data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al agregar el producto', error: error.message });
  }
};

// PUT /api/businesses/mine/:id/products/:pid (authResident) — Editar producto
export const updateMyProduct = async (req, res) => {
  try {
    const residentId = req.user && req.user.residentId;
    if (!residentId) {
      return res.status(401).json({ success: false, message: 'Sesión de residente requerida.' });
    }
    const { id, pid } = req.params;
    const businesses = await loadAndValidateBusinesses();
    const index = businesses.findIndex(b => b.id === id && businessOwnedBy(b, residentId, req.user.phone));

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'No se encontró tu vitrina o no tienes permisos sobre ella.' });
    }

    const biz = businesses[index];
    const pIndex = biz.products.findIndex(p => String(p.id) === String(pid));
    if (pIndex === -1) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado.' });
    }

    const current = biz.products[pIndex];
    const merged = { ...current, ...req.body, id: current.id };
    biz.products[pIndex] = normalizeProduct(merged, pIndex);
    biz.updatedAt = new Date().toISOString();
    await saveBusinesses(businesses);

    res.json({ success: true, message: 'Producto actualizado correctamente.', data: biz.products[pIndex] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al actualizar el producto', error: error.message });
  }
};

// DELETE /api/businesses/mine/:id/products/:pid (authResident) — Eliminar producto
export const deleteMyProduct = async (req, res) => {
  try {
    const residentId = req.user && req.user.residentId;
    if (!residentId) {
      return res.status(401).json({ success: false, message: 'Sesión de residente requerida.' });
    }
    const { id, pid } = req.params;
    const businesses = await loadAndValidateBusinesses();
    const index = businesses.findIndex(b => b.id === id && businessOwnedBy(b, residentId, req.user.phone));

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'No se encontró tu vitrina o no tienes permisos sobre ella.' });
    }

    const biz = businesses[index];
    const before = biz.products.length;
    biz.products = biz.products.filter(p => String(p.id) !== String(pid));
    if (biz.products.length === before) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado.' });
    }
    biz.updatedAt = new Date().toISOString();
    await saveBusinesses(businesses);

    res.json({ success: true, message: 'Producto eliminado correctamente.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al eliminar el producto', error: error.message });
  }
};

// Busca un producto público por id dentro de las vitrinas activas.
// Se usa para el enlace compartible /p/:id (vista previa en WhatsApp).
export const findActiveProductById = async (productId) => {
  const id = String(productId || '').trim();
  if (!id) return null;
  const businesses = await loadAndValidateBusinesses();
  for (const business of businesses) {
    if (business.status !== 'active') continue;
    const product = (business.products || []).find(p => String(p.id) === id);
    if (product) return { business, product };
  }
  return null;
};
