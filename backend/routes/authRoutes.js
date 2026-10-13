import express from 'express';
import {
  requestAdminOtp,
  verifyAdminOtp,
  registerResident,
  residentLogin,
  getResidentProfile,
  getMe,
  logout,
  guestCheckout,
  entryGuest,
  getTowers,
  validateApartmentEndpoint,
  requestOtp,
  verifyOtp,
  residentLookup,
  adminResidents
} from '../controllers/authController.js';
import { authResident, authAny, authAdmin } from '../middleware/auth.js';
import { cachePublic } from '../middleware/cache.js';

const router = express.Router();

// Administración por manzana (teléfono + código OTP)
router.post('/admin/otp/request', requestAdminOtp);
router.post('/admin/otp/verify', verifyAdminOtp);

// Cierre de sesión (limpia la cookie httpOnly)
router.post('/logout', logout);

// Verificación por código (OTP) — acceso al panel "Mi Vitrina"
router.post('/otp/request', requestOtp);
router.post('/otp/verify', verifyOtp);

// Residente
router.post('/resident/register', registerResident);
router.post('/resident/login', residentLogin);
router.get('/resident/profile', authResident, getResidentProfile);

// Sesión (valida cualquier rol: admin o residente)
router.get('/me', authAny, getMe);

// Invitado (checkout rápido)
router.post('/guest/checkout', guestCheckout);

// Ingreso por QR/enlace (rol + datos de la comunidad + T&C)
router.post('/entry', entryGuest);

// Reconocimiento por celular de quien ya ingresó (cliente o emprendedor)
router.post('/resident-lookup', residentLookup);

// Registro de personas que han ingresado (solo admin)
router.get('/admin/residents', authAdmin, adminResidents);

// Utilidades del conjunto (config estable: caché larga en navegador y CDN)
router.get('/towers', cachePublic({ maxAge: 3600, sMaxAge: 86400, staleWhileRevalidate: 86400 }), getTowers);
router.post('/validate-apartment', validateApartmentEndpoint);

export default router;
