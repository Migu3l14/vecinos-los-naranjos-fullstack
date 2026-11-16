import Storage from '../db/storage.js';

const ESTADOS = ['Recibido', 'En Preparación', 'En Camino', 'Entregado', 'Cancelado'];

const generateOrderId = () => `ORD-${Date.now().toString().slice(-6)}`;

/**
 * POST /api/orders
 * Crea un pedido de un producto/servicio de una vitrina.
 * Se crea SIEMPRE tras capturar la identidad del residente (registrado o invitado).
 *
 * body:
 * {
 *   businessId, products: [{id?, name, price?, qty}],
 *   observations?, paymentMethod?,
 *   resident: { fullName, phone, tower, apartment, birthDate?, email?, authType? }
 * }
 */
export const createOrder = async (req, res) => {
  try {
    const { businessId, products, resident, observations, paymentMethod } = req.body;

    if (!businessId) {
      return res.status(400).json({ success: false, message: 'businessId es obligatorio.' });
    }
    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ success: false, message: 'Debe incluir al menos un producto.' });
    }
    if (!resident || !resident.fullName || !resident.phone || !resident.tower || !resident.apartment || !resident.deliveryAddress) {
      return res.status(400).json({ success: false, message: 'Datos de identidad del residente incompletos (incluye la dirección de entrega).' });
    }

    const business = await Storage.findById('businesses', businessId);

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

export default { createOrder, getAllOrders, updateOrderStatus };
