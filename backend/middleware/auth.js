import jwt from 'jsonwebtoken';
import ENV from '../config/env.js';

/**
 * Firma un token JWT con el payload y secreto del proyecto.
 * @param {Object} payload - Datos a codificar
 * @param {string} [expiresIn] - Duración, ej. '7d'
 */
export const signToken = (payload, expiresIn = '7d') => {
  return jwt.sign(payload, ENV.JWT_SECRET, { expiresIn });
};

/**
 * Verifica y decodifica un token JWT.
 * @returns {Object|null} Payload decodificado o null si es inválido
 */
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, ENV.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    return null;
  }
};

/**
 * Extrae el token del header Authorization: Bearer <token>
 * o de la cookie httpOnly de sesión (preferida en el navegador).
 */
const extractToken = (req) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  if (req.cookies && req.cookies.session_token) return req.cookies.session_token;
  return null;
};

/**
 * Middleware: protege rutas que requieren ser ADMIN.
 * Espera un JWT con { role: 'admin' }.
 */
export const authAdmin = (req, res, next) => {
  const token = extractToken(req);
  const payload = token ? verifyToken(token) : null;

  if (!payload || payload.role !== 'admin') {
    return res.status(401).json({ success: false, message: 'Acceso no autorizado. Se requiere rol de administrador.' });
  }

  req.user = payload;
  next();
};

/**
 * Middleware: protege rutas reservadas al SUPER ADMIN (global).
 * Espera un JWT con { role: 'admin', scope: 'super' }.
 * Los administradores de manzana (scope 'manzana' o sin scope) no pasan.
 */
export const authSuperAdmin = (req, res, next) => {
  const token = extractToken(req);
  const payload = token ? verifyToken(token) : null;

  if (!payload || payload.role !== 'admin' || payload.scope !== 'super') {
    return res.status(403).json({ success: false, message: 'Acceso restringido al Super Administrador.' });
  }

  req.user = payload;
  next();
};

/**
 * Middleware: protege rutas que requieren un residente autenticado.
 * Espera un JWT con { role: 'resident', residentId }.
 */
export const authResident = (req, res, next) => {
  const token = extractToken(req);
  const payload = token ? verifyToken(token) : null;

  if (!payload || payload.role !== 'resident') {
    return res.status(401).json({ success: false, message: 'Acceso no autorizado. Inicia sesión como residente.' });
  }

  req.user = payload;
  next();
};

/**
 * Middleware opcional: si hay un token de residente válido, lo adjunta a req.user;
 * si no lo hay, continúa sin rechazar (permite que una vitrina quede vinculada
 * al dueño cuando el usuario está autenticado, sin exigir login).
 */
export const optionalAuthResident = (req, res, next) => {
  const token = extractToken(req);
  const payload = token ? verifyToken(token) : null;
  if (payload && payload.role === 'resident') {
    req.user = payload;
  }
  next();
};

/**
 * Middleware: acepta un token válido de ADMIN o RESIDENTE.
 * Usado por /api/auth/me para validar la sesión activa al cargar la app.
 */
export const authAny = (req, res, next) => {
  const token = extractToken(req);
  const payload = token ? verifyToken(token) : null;

  if (!payload || (payload.role !== 'admin' && payload.role !== 'resident')) {
    return res.status(401).json({ success: false, message: 'Sesión inválida o expirada.' });
  }

  req.user = payload;
  next();
};

export default { signToken, verifyToken, authAdmin, authSuperAdmin, authResident, optionalAuthResident, authAny };
