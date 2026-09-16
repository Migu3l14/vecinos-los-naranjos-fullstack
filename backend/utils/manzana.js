// Utilidades de Manzanas del conjunto Los Naranjos.
// La segmentación de comunicados, vitrinas y residentes depende del mapeo
// Torre → Manzana definido en backend/data/towers.json.
import Storage from '../db/storage.js';

// Normaliza un teléfono a formato internacional Colombia (57..)
export const normalizePhone = (value) => {
  let clean = String(value || '').replace(/\D/g, '');
  if (clean.length === 10) clean = `57${clean}`;
  return clean;
};

// Construye el map { torreId: manzana } a partir de towers.json
export const towerManzanaMap = () => {
  const config = Storage.read('towers') || {};
  const towers = Array.isArray(config.towers) ? config.towers : [];
  const map = {};
  for (const t of towers) {
    if (t.id && t.manzana) map[t.id] = String(t.manzana);
  }
  return map;
};

// Devuelve la manzana (string "1".."6") de una torre, o null si no está mapeada
export const towerToManzana = (towerId) => {
  const map = towerManzanaMap();
  if (!towerId) return null;
  const key = String(towerId).trim();
  if (map[key]) return map[key];
  // Fallback por convención: "torre-N" → manzana "N" (nueva torre sin campo manzana)
  const m = /(?:torre-)?(\d+)/i.exec(key);
  if (m && m[1] >= 1 && m[1] <= 6) return String(m[1]);
  return null;
};

export default { normalizePhone, towerManzanaMap, towerToManzana };