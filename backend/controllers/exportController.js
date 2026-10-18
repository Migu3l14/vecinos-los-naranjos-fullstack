import Storage from '../db/storage.js';

// Colecciones que conforman los datos del proyecto. Se exportan completas para
// poder migrarlas luego a un motor de base de datos real.
// (otp_verifications se omite: son códigos temporales de un solo uso.)
export const COLLECTIONS = [
  'businesses',
  'residents',
  'orders',
  'offers',
  'receipts',
  'transactions',
  'pqrs',
  'supportRequests',
  'announcements',
  'joinRequests',
  'towers',
  'categories',
  'stats',
  'adminUsers'
];

// GET /api/admin/export (solo super admin) — volcado completo de datos (JSON)
export const exportAllData = async (req, res) => {
  try {
    const data = {};
    const totals = {};
    for (const name of COLLECTIONS) {
      const rows = await Storage.read(name);
      data[name] = Array.isArray(rows) ? rows : [];
      totals[name] = data[name].length;
    }

    res.json({
      success: true,
      generatedAt: new Date().toISOString(),
      source: Storage.redisAvailable() ? 'redis' : 'filesystem',
      totals,
      data
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al exportar los datos', error: error.message });
  }
};

export default { exportAllData, COLLECTIONS };
