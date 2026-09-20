import Storage from '../db/storage.js';
import { ensureTowersData } from '../db/seed.js';

const readTowersConfig = async () => {
  let config = await Storage.read('towers');
  const towers = config && Array.isArray(config.towers)
    ? config.towers
    : (Array.isArray(config) ? config : []);
  if (towers.length === 0) {
    await ensureTowersData();
    config = await Storage.read('towers');
  }
  return config;
};

/**
 * Valida la estructura de una torre y un apartamento usando la configuración
 * del conjunto (backend/data/towers.json).
 *
 * Hoy valida de forma ligera:
 * - La torre debe existir en towers.json (por id, nombre o número).
 * - El apartamento debe ser un identificador no vacío.
 *
 * NOTA: La validación fina contra el listado real de apartamentos (verificar que
 * "405" exista en la Torre 1) se habilita cuando se configuren las torres exactas
 * en towers.json. Mientras tanto usamos una validación base para no bloquear el
 * registro de residentes con los códigos reales del conjunto.
 *
 * @param {string} [manzana] Manzana para acotar la búsqueda cuando hay torres
 *   repetidas por unidad (cada manzana tiene sus 10 torres).
 * @returns {{ valid: boolean, error?: string, normalized?: {tower, towerId, apartment} }}
 */
export const validateApartment = async (tower, apartment, manzana) => {
  const config = await readTowersConfig();
  const towers = config && Array.isArray(config.towers) ? config.towers : [];
  const total = config.totalApartments ?? (towers.length ? 2160 : 0);

  if (!tower) {
    return { valid: false, error: 'La torre es obligatoria.' };
  }
  if (!apartment || !String(apartment).trim()) {
    return { valid: false, error: 'El apartamento es obligatorio.' };
  }

  let candidates = towers;
  if (manzana != null && String(manzana).trim() !== '') {
    const filtered = towers.filter(t => String(t.manzana) === String(manzana).trim());
    if (filtered.length > 0) candidates = filtered;
  }

  const towerStr = String(tower).trim().toLowerCase();

  // Buscar torre por id, nombre o número (dentro de la manzana seleccionada)
  const towerMatch = candidates.find(t =>
    String(t.id).toLowerCase() === towerStr ||
    String(t.name).toLowerCase() === towerStr ||
    String(t.index + 1) === towerStr ||
    (t.alias && String(t.alias).toLowerCase() === towerStr)
  ) || (candidates.find(t => String(t.name).toLowerCase().includes(towerStr)));

  if (!towerMatch && towers.length > 0) {
    const avail = candidates.map(t => t.name).join(', ') || 'sin torres configuradas';
    return { valid: false, error: `Torre no válida. Torres disponibles: ${avail}` };
  }

  return {
    valid: true,
    normalized: {
      tower: towerMatch ? towerMatch.name : String(tower).trim(),
      towerId: towerMatch ? towerMatch.id : null,
      apartment: String(apartment).trim()
    }
  };
};

export default validateApartment;
