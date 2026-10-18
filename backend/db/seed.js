import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Storage from './storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración por defecto del conjunto: 6 manzanas × 10 torres,
// cada torre de 9 pisos con 4 apartamentos por piso (101-104 ... 901-904).
// Total: 6 × 10 × 9 × 4 = 2160 apartamentos.
const buildDefaultTowers = () => {
  const towers = [];
  for (let m = 1; m <= 6; m++) {
    for (let n = 1; n <= 10; n++) {
      towers.push({ id: `torre-m${m}-${n}`, name: `Torre ${n}`, manzana: String(m), floors: 9, aptsPerFloor: 4 });
    }
  }
  return { totalApartments: 2160, towers };
};

export async function ensureTowersData() {
  try {
    const existing = await Storage.read('towers');
    const hasTowers = existing && Array.isArray(existing.towers) && existing.towers.length > 0;
    if (hasTowers) return existing;

    let config = buildDefaultTowers();
    const file = path.join(__dirname, '../data/towers.json');
    try {
      if (fs.existsSync(file)) {
        const fromFile = JSON.parse(fs.readFileSync(file, 'utf-8'));
        if (fromFile && Array.isArray(fromFile.towers) && fromFile.towers.length > 0) config = fromFile;
      }
    } catch (readErr) {
      console.error('[SEED] No se pudo leer towers.json, usando valores por defecto.', readErr?.message);
    }

    await Storage.write('towers', config);
    return config;
  } catch (err) {
    console.error('[SEED] No se pudo inicializar la configuración de torres.', err?.message);
    return null;
  }
}

// Garantiza que la colección adminUsers tenga los registros del archivo JSON.
// En cloud (Redis) la colección puede venir vacía o desactualizada (sin el
// campo `scope`); se sincroniza por id para que el super admin y los niveles
// existan también en producción sin tocar Upstash a mano.
export async function ensureAdminUsersData() {
  try {
    const file = path.join(__dirname, '../data/adminUsers.json');
    if (!fs.existsSync(file)) return null;
    const fromFile = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!Array.isArray(fromFile) || fromFile.length === 0) return null;

    const existing = await Storage.read('adminUsers');
    const current = Array.isArray(existing) ? existing : [];
    const byId = new Map(current.map(a => [a.id, a]));
    let changed = current.length !== fromFile.length;

    for (const record of fromFile) {
      const prev = byId.get(record.id);
      if (!prev) {
        changed = true;
        continue;
      }
      // Actualiza campos de configuración si cambiaron en el archivo (p. ej. scope)
      for (const key of ['phone', 'name', 'manzana', 'scope', 'active']) {
        if (record[key] !== undefined && prev[key] !== record[key]) {
          changed = true;
          break;
        }
      }
    }

    if (changed) {
      const merged = fromFile.map(record => ({ ...(byId.get(record.id) || {}), ...record }));
      await Storage.write('adminUsers', merged);
      console.log(`[SEED] adminUsers sincronizado (${merged.length} registros).`);
      return merged;
    }
    return current;
  } catch (err) {
    console.error('[SEED] No se pudo inicializar adminUsers.', err?.message);
    return null;
  }
}

export async function runSeeds() {
  try {
    await ensureTowersData();
    await ensureAdminUsersData();
  } catch (err) {
    console.error('[SEED] Error al sembrar datos iniciales.', err?.message);
  }
}