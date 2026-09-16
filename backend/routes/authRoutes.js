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
  getTowers,
  validateApartmentEndpoint,
  requestOtp,
  verifyOtp
} from '../controllers/authController.js';
import { authResident, authAny } from '../middleware/auth.js';

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

// Utilidades del conjunto
router.get('/towers', getTowers);
router.post('/validate-apartment', validateApartmentEndpoint);

export default router;
