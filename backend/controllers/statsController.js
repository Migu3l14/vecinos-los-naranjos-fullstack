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