// seed-upstash.mjs
// Copia los datos actuales de backend/data/*.json hacia Upstash Redis
// (solo se usa cuando UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN
// están definidas en el entorno). Es una COPIA: los archivos locales no se tocan.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Storage from '../backend/db/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = path.resolve(__dirname, '../backend/data');

async function main() {
  if (!Storage.redisAvailable()) {
    console.error('[SEED] Upstash Redis no está configurado (faltan UPSTASH_REDIS_REST_URL/TOKEN).');
    process.exit(1);
  }
  const files = fs.existsSync(SRC_DIR)
    ? fs.readdirSync(SRC_DIR).filter(f => f.endsWith('.json'))
    : [];
  if (files.length === 0) {
    console.error('[SEED] No hay archivos .json en backend/data.');
    process.exit(1);
  }
  for (const file of files) {
    const raw = fs.readFileSync(path.join(SRC_DIR, file), 'utf-8');
    const data = raw ? JSON.parse(raw) : [];
    await Storage.write(file.replace(/\.json$/, ''), data);
    console.log(`[SEED] ${file} -> Redis (${Array.isArray(data) ? data.length : 1} elemento(s))`);
  }
  console.log('[SEED] Migración completada.');
}

main().catch(err => {
  console.error('[SEED] Error:', err?.message);
  process.exit(1);
});