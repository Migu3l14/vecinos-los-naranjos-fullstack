/**
 * Caché HTTP para lecturas públicas (Fase 1 — Sesión 8: Desempeño en APIs REST).
 *
 * Solo agrega cabeceras `Cache-Control` a las respuestas de solo lectura para que
 * el navegador y el CDN (Vercel Edge) reutilicen respuestas y puedan validar con
 * `ETag`/`304 Not Modified`. NO altera el cuerpo de la respuesta, la lógica de los
 * controladores ni los datos.
 *
 * Regla de seguridad: estas cabeceras se aplican ÚNICAMENTE a rutas GET públicas.
 * Todo endpoint con sesión (auth, recibos, PQRS, panel admin) se queda con
 * `no-store` (ver el valor por defecto en app.js).
 */

const SAFE_METHODS = new Set(['GET', 'HEAD']);

/**
 * Construye un middleware que marca la respuesta como cacheable.
 * @param {Object} opts
 * @param {number} opts.maxAge               Segundos de frescura en el navegador (max-age).
 * @param {number} opts.sMaxAge              Segundos de frescura en el CDN/borde (s-maxage).
 * @param {number} opts.staleWhileRevalidate Segundos para servir copia vieja mientras revalida.
 */
export function cachePublic({ maxAge = 60, sMaxAge = maxAge, staleWhileRevalidate = 0 } = {}) {
  return (req, res, next) => {
    if (!SAFE_METHODS.has(req.method)) return next();
    const parts = ['public', `max-age=${maxAge}`];
    if (sMaxAge >= 0) parts.push(`s-maxage=${sMaxAge}`);
    if (staleWhileRevalidate > 0) parts.push(`stale-while-revalidate=${staleWhileRevalidate}`);
    res.set('Cache-Control', parts.join(', '));
    next();
  };
}

/**
 * Fuerza `no-store`: nada se guarda, ni en navegador ni en CDN.
 * Se usa como valor por defecto para toda la API en app.js.
 */
export function noStore() {
  return (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  };
}

export default cachePublic;
