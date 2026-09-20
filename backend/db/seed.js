import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Storage from './storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function ensureTowersData() {
  try {
    const existing = await Storage.read('towers');
    const hasTowers = existing && Array.isArray(existing.towers) && existing.towers.length > 0;
    if (hasTowers) return existing;

    const file = path.join(__dirname, '../data/towers.json');
    const config = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, 'utf-8'))
      : { totalApartments: 2160, towers: [] };

    if (config && Array.isArray(config.towers) && config.towers.length > 0) {
      await Storage.write('towers', config);
    }
    return config;
  } catch (err) {
    console.error('[SEED] No se pudo inicializar la configuración de torres.', err?.message);
    return null;
  }
}

export async function runSeeds() {
  try {
    await ensureTowersData();
  } catch (err) {
    console.error('[SEED] Error al sembrar datos iniciales.', err?.message);
  }
}