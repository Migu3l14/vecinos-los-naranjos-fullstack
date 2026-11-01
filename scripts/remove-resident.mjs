// remove-resident.mjs — herramienta de mantenimiento puntual (NO se commitea).
// Borra de la colección `residents` el residente cuyo teléfono coincida con el
// argumento. Solo opera sobre Upstash Redis (producción); si no hay credenciales,
// aborta sin tocar los JSON locales.
//
// Uso:  node scripts/remove-resident.mjs 3167017188
import Storage from '../backend/db/storage.js';

const digits = (v) => String(v ?? '').replace(/\D/g, '');
const arg = digits(process.argv[2] || '');

if (!arg) {
  console.error('Uso: node scripts/remove-resident.mjs <telefono>');
  process.exit(1);
}

if (!Storage.redisAvailable()) {
  console.error('[REMOVE] Upstash Redis no está configurado (faltan UPSTASH_REDIS_REST_URL/TOKEN en el entorno). Abortando para no tocar datos locales.');
  process.exit(1);
}

const residents = await Storage.read('residents');
if (!Array.isArray(residents)) {
  console.error('[REMOVE] La colección `residents` no es un arreglo. Abortando.');
  process.exit(1);
}

const isMatch = (r) => {
  const p = digits(r?.phone ?? r?.telefono ?? r?.celular);
  return p === arg || p.endsWith(arg) || arg.endsWith(p);
};

const matched = residents.filter(isMatch);
if (matched.length === 0) {
  console.log(`[REMOVE] No se encontró ningún residente con teléfono ...${arg}. Nada que borrar.`);
  console.log(`[REMOVE] Total de residentes en la colección: ${residents.length}.`);
  process.exit(0);
}

console.log('[REMOVE] Coincidencias encontradas:');
for (const r of matched) {
  console.log(`  - id=${r.id ?? '(sin id)'} phone=${r.phone ?? r.telefono} rol=${r.role ?? '(sin rol)'} manzana=${r.manzana ?? '-'} tower=${r.tower ?? '-'} apto=${r.apartment ?? '-'}`);
}

const remaining = residents.filter((r) => !isMatch(r));
if (remaining.length === residents.length) {
  console.error('[REMOVE] No se pudo filtrar ningún registro. Abortando sin escribir.');
  process.exit(1);
}

await Storage.write('residents', remaining);
console.log(`[REMOVE] Listo. Antes: ${residents.length} → Ahora: ${remaining.length}.`);
console.log('[REMOVE] Nota: si el usuario tenía sesión guardada en el navegador, debe borrar los datos del sitio o usar incógnito.');
