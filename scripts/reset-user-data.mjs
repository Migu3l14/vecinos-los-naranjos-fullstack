// reset-user-data.mjs — herramienta de mantenimiento puntual (NO se commitea).
// Vacía las colecciones de datos de usuarios en Upstash Redis (producción),
// dejando intactos: businesses, categories, towers y adminUsers.
// Solo opera sobre Redis; sin credenciales aborta sin tocar los JSON locales.
//
// Uso:  node scripts/reset-user-data.mjs
import Storage from '../backend/db/storage.js';

const COLLECTIONS = [
  'residents',
  'otp_verifications',
  'joinRequests',
  'supportRequests',
  'orders',
  'pqrs',
  'offers',
  'receipts',
  'transactions',
  'announcements',
  'stats'
];

if (!Storage.redisAvailable()) {
  console.error('[RESET] Upstash Redis no está configurado (faltan UPSTASH_REDIS_REST_URL/TOKEN). Abortando para no tocar datos locales.');
  process.exit(1);
}

console.log('[RESET] Vaciando colecciones de datos de usuarios en producción...');
let total = 0;
for (const name of COLLECTIONS) {
  const before = await Storage.read(name);
  const count = Array.isArray(before) ? before.length : (before ? 1 : 0);
  await Storage.write(name, []);
  const after = await Storage.read(name);
  const now = Array.isArray(after) ? after.length : 0;
  total += count;
  console.log(`  - ${name}: ${count} -> ${now}`);
}
console.log(`[RESET] Listo. ${total} registro(s) eliminados en ${COLLECTIONS.length} colecciones.`);
console.log('[RESET] Intactos: businesses, categories, towers, adminUsers.');
console.log('[RESET] Los dispositivos re-registrarán al recargar (el arreglo de código ya desplegado cierra su sesión).');
