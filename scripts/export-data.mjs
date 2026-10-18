// Volcado local de todos los datos (para respaldar / migrar a una base de datos).
// Uso: `npm run export`  →  genera exports/los-naranjos-export-<fecha>.json
//
// - En local lee los JSON de backend/data/*.json.
// - Si defines UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN (en .env), exporta
//   los datos de producción desde Redis.
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import Storage from '../backend/db/storage.js';
import { COLLECTIONS } from '../backend/controllers/exportController.js';

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const outDir = path.join(process.cwd(), 'exports');
fs.mkdirSync(outDir, { recursive: true });

const data = {};
for (const name of COLLECTIONS) {
  const rows = await Storage.read(name);
  data[name] = Array.isArray(rows) ? rows : [];
}

const payload = {
  generatedAt: new Date().toISOString(),
  source: Storage.redisAvailable() ? 'redis' : 'filesystem',
  data
};

const file = path.join(outDir, `los-naranjos-export-${stamp}.json`);
fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf-8');

console.log(`✅ Exportación creada: ${file}`);
console.log(`   Origen: ${payload.source}`);
for (const [name, rows] of Object.entries(data)) {
  console.log(`   - ${name}: ${rows.length}`);
}
