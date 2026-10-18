import Storage from '../db/storage.js';

const pad = (n) => String(n).padStart(2, '0');

// Fecha local (AAAA-MM-DD) desplazada en días (negativo = hacia atrás)
const dateKey = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const getTodayISODate = () => dateKey(0);

// POST /api/stats/visit — registra una visita (con dedupe desde el frontend)
export const registerVisit = async (req, res) => {
  try {
    const today = getTodayISODate();
    const stats = await Storage.read('stats');
    const row = stats.find(s => s.date === today);
    if (row) {
      row.visits = (row.visits || 0) + 1;
      await Storage.write('stats', stats);
    } else {
      stats.push({ date: today, visits: 1 });
      await Storage.write('stats', stats);
    }
    res.json({ success: true, message: 'Visita registrada.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al registrar la visita', error: error.message });
  }
};

// GET /api/stats — portada: visitas + emprendedores (dinámico de la BD)
export const getStats = async (req, res) => {
  try {
    const stats = await Storage.read('stats');
    const businesses = await Storage.read('businesses');

    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const key = dateKey(-i);
      const row = stats.find(s => s.date === key);
      last7Days.push({ date: key, visits: row ? (row.visits || 0) : 0 });
    }

    const today = last7Days[6] || { visits: 0 };

    res.json({
      success: true,
      data: {
        todayVisits: today.visits,
        totalVisits: stats.reduce((acc, s) => acc + (s.visits || 0), 0),
        last7Days,
        totalEntrepreneurs: businesses.length,
        activeEntrepreneurs: businesses.filter(b => b.status === 'active').length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener estadísticas', error: error.message });
  }
};

// GET /api/stats/admin — panel del super admin: visitas, vitrinas,
// residentes, PQRS, pedidos y solicitudes de soporte.
export const getAdminStats = async (req, res) => {
  try {
    const [stats, businesses, residents, pqrs, orders, support] = await Promise.all([
      Storage.read('stats'),
      Storage.read('businesses'),
      Storage.read('residents'),
      Storage.read('pqrs'),
      Storage.read('orders'),
      Storage.read('supportRequests')
    ]);

    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const key = dateKey(-i);
      const row = stats.find(s => s.date === key);
      last7Days.push({ date: key, visits: row ? (row.visits || 0) : 0 });
    }

    const countBy = (list, field) => list.reduce((acc, item) => {
      const key = item?.[field] || 'sin-dato';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        visits: {
          today: last7Days[6]?.visits || 0,
          total: stats.reduce((acc, s) => acc + (s.visits || 0), 0),
          last7Days
        },
        businesses: {
          total: businesses.length,
          byStatus: countBy(businesses, 'status'),
          byManzana: countBy(businesses, 'manzana')
        },
        residents: {
          total: residents.length,
          byRole: countBy(residents, 'role')
        },
        pqrs: {
          total: pqrs.length,
          byStatus: countBy(pqrs, 'estado')
        },
        orders: {
          total: orders.length,
          byStatus: countBy(orders, 'estado')
        },
        support: {
          total: support.length
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener estadísticas de administración', error: error.message });
  }
};