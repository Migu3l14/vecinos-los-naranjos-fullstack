import Storage from '../db/storage.js';
import { findOwnedBusinesses } from './businessController.js';

const ESTADOS = ['Recibido', 'En Preparación', 'En Camino', 'Entregado', 'Cancelado'];

// Devuelve los ids de las vitrinas del residente autenticado (vendedor).
const ownedBusinessIds = async (user) => {
  const owned = await findOwnedBusinesses(user);
  return new Set(owned.map(b => String(b.id)));
};

const generateOrderId = () => `ORD-${Date.now().toString().slice(-6)}`;

const formatLocationPart = (value, label) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return new RegExp(`^${label}\\b`, 'i').test(raw) ? raw : `${label} ${raw}`;
};

const resolveManzana = (resident) => {
  if (resident.manzana != null && String(resident.manzana).trim() !== '') {
    return String(resident.manzana).trim();
  }
  const fromTowerId = /^torre-m(\d+)-/i.exec(String(resident.towerId || '').trim());
  return fromTowerId ? fromTowerId[1] : '';
};

const formatResidentLocation = (resident) => {
  const manzana = resolveManzana(resident);
  return [
    manzana ? formatLocationPart(manzana, 'Manzana') : '',
    formatLocationPart(resident.tower, 'Torre'),
    formatLocationPart(resident.apartment, 'Apto')
  ].filter(Boolean).join(' · ');
};

/**
 * POST /api/orders
 * Crea un pedido de un producto/servicio de una vitrina.
 * Se crea SIEMPRE tras capturar la identidad del residente (registrado o invitado).
 * Si llega un token de residente válido, la identidad se toma del perfil guardado
 * en el servidor y se permiten compradores externos (sin torre/apartamento).
 *
 * body:
 * {
 *   businessId, products: [{id?, name, price?, qty}],
 *   observations?, paymentMethod?,
 *   resident: { fullName, phone, tower?, apartment?, deliveryAddress, birthDate?, email?, authType? }
 * }
 */
export const createOrder = async (req, res) => {
  try {
    const { businessId, products, resident: bodyResident, observations, paymentMethod } = req.body;

    if (!businessId) {
      return res.status(400).json({ success: false, message: 'businessId es obligatorio.' });
    }
    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ success: false, message: 'Debe incluir al menos un producto.' });
    }

    const provided = bodyResident && typeof bodyResident === 'object' ? bodyResident : {};
    let profile = null;
    if (req.user && req.user.role === 'resident' && req.user.residentId) {
      profile = await Storage.findById('residents', req.user.residentId);
      if (!profile) {
        return res.status(401).json({ success: false, message: 'La sesión del residente no es válida. Ingresa nuevamente.' });
      }
    }

    const external = !!profile && (profile.role === 'guard' || !profile.tower || !profile.apartment);
    let resident;
    if (profile) {
      resident = {
        fullName: profile.fullName || provided.fullName || (external ? 'Visitante' : 'Vecino'),
        phone: profile.phone || provided.phone,
        tower: profile.tower || null,
        apartment: profile.apartment || null,
        deliveryAddress: provided.deliveryAddress || profile.deliveryAddress || (external ? '' : formatResidentLocation(profile)),
        email: profile.email || provided.email || null,
        authType: profile.authType || provided.authType || 'entry'
      };
      if (!resident.phone || !resident.deliveryAddress) {
        return res.status(400).json({ success: false, message: 'Datos de identidad del residente incompletos (incluye la dirección de entrega).' });
      }
    } else {
      resident = provided;
      if (!resident.fullName || !resident.phone || !resident.tower || !resident.apartment || !resident.deliveryAddress) {
        return res.status(400).json({ success: false, message: 'Datos de identidad del residente incompletos (incluye la dirección de entrega).' });
      }
    }

    const business = await Storage.findById('businesses', businessId);

    if (profile && external && resident.deliveryAddress !== profile.deliveryAddress) {
      await Storage.updateById('residents', profile.id, {
        deliveryAddress: resident.deliveryAddress,
        lastOrderAt: new Date().toISOString()
      });
    }

    const order = {
      id: `order-${Date.now()}`,
      orderId: generateOrderId(),
      businessId,
      businessName: business ? business.name : 'Vitrina',
      products: products.map(p => ({
        id: p.id ? String(p.id) : null,
        name: p.name,
        price: p.price || null,
        qty: Math.min(Math.max(parseInt(p.qty, 10) || 1, 1), 99)
      })),
      observations: typeof observations === 'string' && observations.trim()
        ? observations.trim().slice(0, 300)
        : null,
      paymentMethod: typeof paymentMethod === 'string' && paymentMethod.trim()
        ? paymentMethod.trim().slice(0, 40)
        : null,
      resident: {
        fullName: resident.fullName,
        phone: String(resident.phone).replace(/\D/g, ''),
        tower: resident.tower,
        apartment: resident.apartment,
        deliveryAddress: resident.deliveryAddress,
        email: resident.email || null,
        authType: resident.authType || 'guest'
      },
      channel: 'whatsapp',
      estado: 'Recibido',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await Storage.insert('orders', order);
    res.status(201).json({
      success: true,
      message: 'Pedido registrado. Se abrirá WhatsApp para coordinarlo.',
      data: order
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al crear el pedido', error: error.message });
  }
};

// GET /api/orders (admin) — listar pedidos para trazabilidad
export const getAllOrders = async (req, res) => {
  try {
    const { estado } = req.query;
    let orders = await Storage.read('orders');
    if (estado && ESTADOS.includes(estado)) {
      orders = orders.filter(o => o.estado === estado);
    }
    orders = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al listar pedidos', error: error.message });
  }
};

// GET /api/orders/mine (vendedor) — pedidos de mis vitrinas
export const getMyOrders = async (req, res) => {
  try {
    if (!req.user || !req.user.residentId) {
      return res.status(401).json({ success: false, message: 'Sesión de residente requerida.' });
    }
    const ids = await ownedBusinessIds(req.user);
    const { estado } = req.query;
    let orders = await Storage.read('orders');
    orders = orders.filter(o => ids.has(String(o.businessId)));
    if (estado && ESTADOS.includes(estado)) {
      orders = orders.filter(o => o.estado === estado);
    }
    orders = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al listar tus pedidos', error: error.message });
  }
};

// GET /api/orders/my-purchases (comprador) — pedidos hechos con mi celular
export const getMyPurchases = async (req, res) => {
  try {
    const phone = String((req.user && req.user.phone) || '').replace(/\D/g, '');
    const tail = phone.slice(-10);
    if (tail.length < 10) {
      return res.json({ success: true, count: 0, data: [] });
    }
    const { estado } = req.query;
    let orders = await Storage.read('orders');
    orders = orders.filter(o =>
      String((o.resident && o.resident.phone) || '').replace(/\D/g, '').slice(-10) === tail
    );
    if (estado && ESTADOS.includes(estado)) {
      orders = orders.filter(o => o.estado === estado);
    }
    orders = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al listar tus compras', error: error.message });
  }
};

// PUT /api/orders/mine/:id/status (vendedor) — actualizar estado de un pedido propio
export const updateMyOrderStatus = async (req, res) => {
  try {
    if (!req.user || !req.user.residentId) {
      return res.status(401).json({ success: false, message: 'Sesión de residente requerida.' });
    }
    const { id } = req.params;
    const { estado } = req.body;
    if (!ESTADOS.includes(estado)) {
      return res.status(400).json({ success: false, message: `Estado inválido. Opciones: ${ESTADOS.join(', ')}` });
    }
    const ids = await ownedBusinessIds(req.user);
    const order = await Storage.findById('orders', id);
    if (!order || !ids.has(String(order.businessId))) {
      return res.status(404).json({ success: false, message: 'Pedido no encontrado o no tienes permisos sobre él.' });
    }

    const updated = await Storage.updateById('orders', id, { estado, updatedAt: new Date().toISOString() });
    res.json({ success: true, message: `Pedido marcado como "${estado}".`, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al actualizar pedido', error: error.message });
  }
};

// PUT /api/orders/:id/status (admin) — actualizar estado del pedido
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    if (!ESTADOS.includes(estado)) {
      return res.status(400).json({ success: false, message: `Estado inválido. Opciones: ${ESTADOS.join(', ')}` });
    }
    const order = await Storage.findById('orders', id);
    if (!order) return res.status(404).json({ success: false, message: 'Pedido no encontrado.' });

    const updated = await Storage.updateById('orders', id, { estado, updatedAt: new Date().toISOString() });
    res.json({ success: true, message: `Pedido marcado como "${estado}".`, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al actualizar pedido', error: error.message });
  }
};

export default { createOrder, getAllOrders, getMyOrders, getMyPurchases, updateMyOrderStatus, updateOrderStatus };
