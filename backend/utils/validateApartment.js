import Storage from '../db/storage.js';

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
 * @returns {{ valid: boolean, error?: string, normalized?: {tower, towerId, apartment} }}
 */
export const validateApartment = (tower, apartment) => {
  const config = Storage.read('towers');
  const towers = Array.isArray(config.towers) ? config.towers : [];
  const total = config.totalApartments ?? (towers.length ? 2160 : 0);

  if (!tower) {
    return { valid: false, error: 'La torre es obligatoria.' };
  }
  if (!apartment || !String(apartment).trim()) {
    return { valid: false, error: 'El apartamento es obligatorio.' };
  }

  const towerStr = String(tower).trim().toLowerCase();

  // Buscar torre por id, nombre o número
  const towerMatch = towers.find(t =>
    String(t.id).toLowerCase() === towerStr ||
    String(t.name).toLowerCase() === towerStr ||
    String(t.index + 1) === towerStr ||
    (t.alias && String(t.alias).toLowerCase() === towerStr)
  ) || (towers.find(t => String(t.name).toLowerCase().includes(towerStr)));

  if (!towerMatch && towers.length > 0) {
    const avail = towers.map(t => t.name).join(', ') || 'sin torres configuradas';
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
