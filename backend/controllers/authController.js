import bcrypt from 'bcryptjs';
import Storage from '../db/storage.js';
import ENV from '../config/env.js';
import { signToken } from '../middleware/auth.js';
import validateApartment from '../utils/validateApartment.js';
import { ensureTowersData } from '../db/seed.js';
import {
  validateFullName,
  validateEmail,
  validatePhone,
  validatePassword,
  validateBirthDate
} from '../utils/validation.js';

// ---------- Utilidades ----------
const normalizePhone = (phone) => {
  let clean = String(phone || '').replace(/\D/g, '');
  if (clean.length === 10) clean = `57${clean}`;
  return clean;
};

const findResidentByPhone = async (phone) => {
  const clean = normalizePhone(phone);
  const residents = await Storage.read('residents');
  return residents.find(r => (r.phone || '').replace(/\D/g, '').endsWith(clean)
    || clean.endsWith((r.phone || '').replace(/\D/g, ''))) || null;
};

// ---------- Sesión por cookie httpOnly (inmune a XSS) ----------
const SESSION_COOKIE = 'session_token';
const isProd = ENV.NODE_ENV === 'production';

const setSessionCookie = (res, token, maxAgeMs) => {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: maxAgeMs,
    path: '/'
  });
};

const clearSessionCookie = (res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
};

// ---------- ADMINISTRACIÓN POR MANZANA (teléfono + OTP) ----------
// Los administradores de cada manzana acceden con el teléfono de la
// administración registrado en adminUsers.json. Nada de correos.
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const findAdminByPhone = async (phone) => {
  const clean = normalizePhone(phone);
  const admins = await Storage.read('adminUsers');
  return (admins || []).find(a =>
    a.active === true && (normalizePhone(a.phone) === clean ||
      String(a.phone || '').replace(/\D/g, '').endsWith(clean.slice(-10)) ||
      clean.endsWith(String(a.phone || '').replace(/\D/g, '')))
  ) || null;
};

// POST /api/auth/admin/otp/request — valida el teléfono de administración y genera el código
export const requestAdminOtp = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'El teléfono de administración es obligatorio.' });
    }
    const vPhone = validatePhone(phone);
    if (vPhone) return res.status(400).json({ success: false, message: vPhone });

    const admin = await findAdminByPhone(phone);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Este teléfono no está registrado como administración de una manzana.' });
    }

    const clean = normalizePhone(phone);

    // Espera mínima entre envíos (anti-spam) y una sola vigencia por teléfono
    const last = await latestPendingOtp(clean);
    if (last) {
      const elapsed = Date.now() - new Date(last.createdAt).getTime();
      if (elapsed < OTP_RESEND_COOLDOWN_MS) {
        const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
        return res.status(429).json({ success: false, message: `Espera ${wait}s para solicitar un nuevo código.` });
      }
      await expirePendingOtpsForPhone(clean);
    }

    const code = generateOtpCode();
    const record = {
      id: `otp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      phone: clean,
      role: 'admin',
      code,
      attempts: 0,
      expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    await Storage.insert('otp_verifications', record);

    res.json({
      success: true,
      message: 'Código de verificación generado.',
      data: {
        code, // visible en la propia aplicación (mismo criterio que los vendedores)
        expiresInSeconds: Math.floor(OTP_TTL_MS / 1000)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al solicitar el código admin', error: error.message });
  }
};

// POST /api/auth/admin/otp/verify — valida el código y abre la sesión del administrador
export const verifyAdminOtp = async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) {
      return res.status(400).json({ success: false, message: 'Teléfono y código son requeridos.' });
    }
    const vPhone = validatePhone(phone);
    if (vPhone) return res.status(400).json({ success: false, message: vPhone });
    if (!/^\d{4}$/.test(String(code))) {
      return res.status(400).json({ success: false, message: 'El código debe tener 4 dígitos.' });
    }

    const clean = normalizePhone(phone);
    const otp = await latestPendingOtp(clean);
    if (!otp) {
      return res.status(401).json({ success: false, message: 'No hay un código vigente para este teléfono. Solicita uno nuevo.' });
    }

    // Vigencia de 5 minutos
    if (new Date(otp.expiresAt).getTime() < Date.now()) {
      await Storage.updateById('otp_verifications', otp.id, { status: 'expired', expiredAt: new Date().toISOString() });
      return res.status(401).json({ success: false, message: 'El código expiró. Solicita uno nuevo.' });
    }

    if (String(otp.code) !== String(code)) {
      const attempts = (otp.attempts || 0) + 1;
      const maxed = attempts >= OTP_MAX_ATTEMPTS;
      await Storage.updateById('otp_verifications', otp.id, maxed
        ? { attempts, status: 'expired', expiredAt: new Date().toISOString() }
        : { attempts });
      return res.status(401).json({
        success: false,
        message: maxed ? 'Demasiados intentos. Solicita un código nuevo.' : 'Código incorrecto.'
      });
    }

    // Código correcto: se marca como usado (una sola vez)
    await Storage.updateById('otp_verifications', otp.id, { status: 'used', usedAt: new Date().toISOString() });

    const admin = await findAdminByPhone(clean);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Administración no encontrada para este teléfono.' });
    }

    const token = signToken({ role: 'admin', phone: admin.phone, manzana: String(admin.manzana) }, ADMIN_SESSION_TTL_MS / 1000);
    setSessionCookie(res, token, ADMIN_SESSION_TTL_MS);
    res.json({
      success: true,
      message: `Bienvenido, Administración Manzana ${admin.manzana}.`,
      data: { token, role: 'admin', phone: admin.phone, manzana: String(admin.manzana), name: admin.name }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al verificar el código admin', error: error.message });
  }
};

// ---------- RESIDENTE (Registro) ----------
// POST /api/auth/resident/register
export const registerResident = async (req, res) => {
  try {
    const { fullName, phone, email, tower, apartment, birthDate, password } = req.body;

    if (!fullName || !phone || !tower || !apartment || !birthDate || !password) {
      return res.status(400).json({ success: false, message: 'Nombre, teléfono, torre, apartamento, fecha de nacimiento y contraseña son obligatorios.' });
    }

    // Validaciones básicas de entrada
    const vName = validateFullName(fullName);
    if (vName) return res.status(400).json({ success: false, message: vName });
    const vPhone = validatePhone(phone);
    if (vPhone) return res.status(400).json({ success: false, message: vPhone });
    const vEmail = validateEmail(email);
    if (vEmail) return res.status(400).json({ success: false, message: vEmail });
    const vPass = validatePassword(password);
    if (vPass) return res.status(400).json({ success: false, message: vPass });
    const vBirth = validateBirthDate(birthDate);
    if (vBirth) return res.status(400).json({ success: false, message: vBirth });

    // Validar estructura torre/apartamento
    const check = await validateApartment(tower, apartment);
    if (!check.valid) {
      return res.status(400).json({ success: false, message: check.error });
    }

    const cleanPhone = normalizePhone(phone);
    if (await findResidentByPhone(cleanPhone)) {
      return res.status(409).json({ success: false, message: 'Ya existe una cuenta con este teléfono.' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);

    const resident = {
      id: `res-${Date.now()}`,
      fullName,
      phone: cleanPhone,
      email: email || null,
      tower: check.normalized.tower,
      towerId: check.normalized.towerId,
      apartment: check.normalized.apartment,
      birthDate,
      authType: 'registered',
      passwordHash,
      createdAt: new Date().toISOString(),
      lastLoginAt: null
    };

    await Storage.insert('residents', resident);

    const token = signToken({ role: 'resident', residentId: resident.id, phone: cleanPhone });
    setSessionCookie(res, token, 7 * 24 * 60 * 60 * 1000);
    res.status(201).json({
      success: true,
      message: 'Cuenta creada correctamente.',
      data: { token, resident: toPublicProfile(resident) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al registrar residente', error: error.message });
  }
};

// POST /api/auth/resident/login
// Autocompleta torre, apartamento y teléfono guardados en el perfil.
export const residentLogin = async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ success: false, message: 'Teléfono y contraseña requeridos.' });
    }

    const resident = await findResidentByPhone(phone);
    if (!resident || !resident.passwordHash) {
      return res.status(401).json({ success: false, message: 'No se encontró una cuenta registrada con este teléfono.' });
    }

    const ok = bcrypt.compareSync(password, resident.passwordHash);
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Contraseña incorrecta.' });
    }

    resident.lastLoginAt = new Date().toISOString();
    await Storage.updateById('residents', resident.id, { lastLoginAt: resident.lastLoginAt });

    const token = signToken({ role: 'resident', residentId: resident.id, phone: resident.phone });
    setSessionCookie(res, token, 7 * 24 * 60 * 60 * 1000);
    res.json({
      success: true,
      message: 'Sesión iniciada.',
      data: { token, resident: toPublicProfile(resident) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al iniciar sesión', error: error.message });
  }
};

// GET /api/auth/resident/profile (protegido)
export const getResidentProfile = async (req, res) => {
  try {
    const resident = await Storage.findById('residents', req.user.residentId);
    if (!resident) {
      return res.status(404).json({ success: false, message: 'Residente no encontrado.' });
    }
    res.json({ success: true, data: toPublicProfile(resident) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener perfil', error: error.message });
  }
};

// GET /api/auth/me (protegido por authAny) — Valida la sesión y devuelve rol + perfil
export const getMe = async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      return res.json({
        success: true,
        data: { role: 'admin', phone: req.user.phone, manzana: req.user.manzana, isAdmin: true, resident: null }
      });
    }

    const resident = await Storage.findById('residents', req.user.residentId);
    if (!resident) {
      return res.status(404).json({ success: false, message: 'Residente no encontrado.' });
    }
    return res.json({
      success: true,
      data: { role: 'resident', resident: toPublicProfile(resident), isAdmin: false }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al validar la sesión', error: error.message });
  }
};

// ---------- INVITADO (Checkout rápido, sin contraseña) ----------
// POST /api/auth/guest/checkout — identidad rápida para el checkout (nombre, nacimiento)
export const guestCheckout = async (req, res) => {
  try {
    const { fullName, phone, tower, apartment, birthDate, email, deliveryAddress } = req.body;

    if (!fullName || !phone || !tower || !apartment || !birthDate || !deliveryAddress) {
      return res.status(400).json({ success: false, message: 'Nombre completo, teléfono, torre, apartamento, fecha de nacimiento y dirección de entrega son obligatorios.' });
    }

    const vName = validateFullName(fullName);
    if (vName) return res.status(400).json({ success: false, message: vName });
    const vPhone = validatePhone(phone);
    if (vPhone) return res.status(400).json({ success: false, message: vPhone });
    const vEmail = validateEmail(email);
    if (vEmail) return res.status(400).json({ success: false, message: vEmail });
    const vBirth = validateBirthDate(birthDate);
    if (vBirth) return res.status(400).json({ success: false, message: vBirth });

    const check = await validateApartment(tower, apartment);
    if (!check.valid) {
      return res.status(400).json({ success: false, message: check.error });
    }

    const cleanPhone = normalizePhone(phone);

    // Reutilizar si el mismo teléfono ya está en la base comunal
    let resident = await findResidentByPhone(cleanPhone);
    if (resident) {
      // Actualizar datos del invitado
      resident = await Storage.updateById('residents', resident.id, {
        fullName,
        tower: check.normalized.tower,
        towerId: check.normalized.towerId,
        apartment: check.normalized.apartment,
        deliveryAddress,
        birthDate,
        email: email || resident.email,
        authType: resident.authType || 'guest',
        acceptedTermsAt: resident.acceptedTermsAt || new Date().toISOString(),
        lastGuestCheckoutAt: new Date().toISOString()
      });
    } else {
      resident = {
        id: `res-${Date.now()}`,
        fullName,
        phone: cleanPhone,
        email: email || null,
        tower: check.normalized.tower,
        towerId: check.normalized.towerId,
        apartment: check.normalized.apartment,
        deliveryAddress,
        birthDate,
        authType: 'guest',
        passwordHash: null,
        createdAt: new Date().toISOString(),
        acceptedTermsAt: new Date().toISOString(),
        guestCheckouts: 1,
        lastGuestCheckoutAt: new Date().toISOString()
      };
      await Storage.insert('residents', resident);
    }

    const token = signToken({ role: 'resident', residentId: resident.id, phone: resident.phone });
    setSessionCookie(res, token, 7 * 24 * 60 * 60 * 1000);
    res.status(201).json({
      success: true,
      message: 'Información guardada. ¡Gracias por registrarte en la comunidad!',
      data: { residentId: resident.id, token, resident: toPublicProfile(resident) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al procesar invitado', error: error.message });
  }
};

// POST /api/auth/entry — ingreso rápido por QR/enlace: rol + celular + manzana + torre/apto + T&C
export const entryGuest = async (req, res) => {
  try {
    const { phone, manzana, tower, apartment, role, acceptedTerms } = req.body;

    if (!phone || !manzana || !tower || !apartment) {
      return res.status(400).json({ success: false, message: 'Celular, manzana, torre y apartamento son obligatorios.' });
    }
    if (role !== 'buyer' && role !== 'seller') {
      return res.status(400).json({ success: false, message: 'Debes indicar si ingresas como Comprador o como Vendedor.' });
    }
    if (acceptedTerms !== true) {
      return res.status(400).json({ success: false, message: 'Debes aceptar los Términos y Condiciones para continuar.' });
    }
    if (!['1', '2', '3', '4', '5', '6'].includes(String(manzana))) {
      return res.status(400).json({ success: false, message: 'Selecciona una manzana válida (1 a 6).' });
    }

    const vPhone = validatePhone(phone);
    if (vPhone) return res.status(400).json({ success: false, message: vPhone });

    const check = await validateApartment(tower, apartment, manzana);
    if (!check.valid) {
      return res.status(400).json({ success: false, message: check.error });
    }

    const cleanPhone = normalizePhone(phone);
    let resident = await findResidentByPhone(cleanPhone);

    if (resident) {
      resident = await Storage.updateById('residents', resident.id, {
        tower: check.normalized.tower,
        towerId: check.normalized.towerId,
        apartment: check.normalized.apartment,
        manzana: String(manzana),
        role,
        acceptedTermsAt: resident.acceptedTermsAt || new Date().toISOString(),
        lastEntryAt: new Date().toISOString()
      });
    } else {
      resident = {
        id: `res-${Date.now()}`,
        phone: cleanPhone,
        fullName: null,
        email: null,
        tower: check.normalized.tower,
        towerId: check.normalized.towerId,
        apartment: check.normalized.apartment,
        manzana: String(manzana),
        role,
        birthDate: null,
        authType: 'entry',
        passwordHash: null,
        createdAt: new Date().toISOString(),
        acceptedTermsAt: new Date().toISOString(),
        lastEntryAt: new Date().toISOString()
      };
      await Storage.insert('residents', resident);
    }

    const token = signToken({ role: 'resident', residentId: resident.id, phone: resident.phone });
    setSessionCookie(res, token, 7 * 24 * 60 * 60 * 1000);
    res.status(201).json({
      success: true,
      message: '¡Bienvenido a la Vitrina Digital Los Naranjos!',
      data: { residentId: resident.id, token, resident: toPublicProfile(resident) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al registrar el ingreso', error: error.message });
  }
};

// ---------- VERIFICACIÓN POR CÓDIGO (OTP) ----------
// El código se muestra en la propia app y se persiste en otp_verifications.json
// para verificación y auditoría. Nunca depende de plataformas externas.
const OTP_MAX_ATTEMPTS = 3;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

const generateOtpCode = () => String(Math.floor(1000 + Math.random() * 9000));

const findOtpRecordsForPhone = async (phone) => {
  const clean = normalizePhone(phone);
  return (await Storage.read('otp_verifications') || []).filter(o => o.phone === clean);
};

const latestPendingOtp = async (phone) => {
  return (await findOtpRecordsForPhone(phone))
    .filter(o => o.status === 'pending')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
};

// Al generar un nuevo código, se invalidan los pendientes del MISMO teléfono
// para que nunca coexistan dos códigos válidos para el mismo vendedor.
const expirePendingOtpsForPhone = async (phone) => {
  const clean = normalizePhone(phone);
  const all = await Storage.read('otp_verifications');
  let changed = false;
  const updated = (all || []).map(o => {
    if (o.phone === clean && o.status === 'pending') {
      changed = true;
      return { ...o, status: 'expired', invalidatedAt: new Date().toISOString() };
    }
    return o;
  });
  if (changed) await Storage.write('otp_verifications', updated);
};

// ¿El teléfono tiene al menos una vitrina (ownerPhone o phone)?
const hasBusinessForPhone = async (phone) => {
  const clean = normalizePhone(phone);
  const businesses = await Storage.read('businesses');
  return (businesses || []).some(b =>
    normalizePhone(b.ownerPhone) === clean || normalizePhone(b.phone) === clean
  );
};

// POST /api/auth/otp/request — genera y persiste el código de verificación
export const requestOtp = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'El teléfono es obligatorio.' });
    }
    const vPhone = validatePhone(phone);
    if (vPhone) return res.status(400).json({ success: false, message: vPhone });

    const clean = normalizePhone(phone);

    // Solo vendedores que ya tienen vitrina pueden autenticarse con el código
    if (!(await hasBusinessForPhone(clean))) {
      return res.status(404).json({ success: false, message: 'No encontramos una vitrina con ese teléfono.' });
    }

    // Espera mínima entre envíos (anti-spam) y una sola vigencia por teléfono
    const last = await latestPendingOtp(clean);
    if (last) {
      const elapsed = Date.now() - new Date(last.createdAt).getTime();
      if (elapsed < OTP_RESEND_COOLDOWN_MS) {
        const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
        return res.status(429).json({ success: false, message: `Espera ${wait}s para solicitar un nuevo código.` });
      }
      await expirePendingOtpsForPhone(clean);
    }

    const code = generateOtpCode();
    const record = {
      id: `otp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      phone: clean,
      code,
      attempts: 0,
      expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    await Storage.insert('otp_verifications', record);

    res.json({
      success: true,
      message: 'Código de verificación generado.',
      data: {
        code, // visible en la propia aplicación (requisito del negocio)
        expiresInSeconds: Math.floor(OTP_TTL_MS / 1000)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al solicitar el código', error: error.message });
  }
};

// POST /api/auth/otp/verify — valida el código contra la base de datos
export const verifyOtp = async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) {
      return res.status(400).json({ success: false, message: 'Teléfono y código son requeridos.' });
    }
    const vPhone = validatePhone(phone);
    if (vPhone) return res.status(400).json({ success: false, message: vPhone });
    if (!/^\d{4}$/.test(String(code))) {
      return res.status(400).json({ success: false, message: 'El código debe tener 4 dígitos.' });
    }

    const clean = normalizePhone(phone);
    const otp = await latestPendingOtp(clean);
    if (!otp) {
      return res.status(401).json({ success: false, message: 'No hay un código vigente para este teléfono. Solicita uno nuevo.' });
    }

    // Vigencia de 5 minutos
    if (new Date(otp.expiresAt).getTime() < Date.now()) {
      await Storage.updateById('otp_verifications', otp.id, { status: 'expired', expiredAt: new Date().toISOString() });
      return res.status(401).json({ success: false, message: 'El código expiró. Solicita uno nuevo.' });
    }

    if (String(otp.code) !== String(code)) {
      const attempts = (otp.attempts || 0) + 1;
      const maxed = attempts >= OTP_MAX_ATTEMPTS;
      await Storage.updateById('otp_verifications', otp.id, maxed
        ? { attempts, status: 'expired', expiredAt: new Date().toISOString() }
        : { attempts });
      return res.status(401).json({
        success: false,
        message: maxed ? 'Demasiados intentos. Solicita un código nuevo.' : 'Código incorrecto.'
      });
    }

    // Código correcto: se marca como usado (una sola vez)
    await Storage.updateById('otp_verifications', otp.id, { status: 'used', usedAt: new Date().toISOString() });

    // Crear o reutilizar el vecino por teléfono (authType 'otp') y abrir sesión
    let resident = await findResidentByPhone(clean);
    if (!resident) {
      resident = {
        id: `res-${Date.now()}`,
        fullName: null,
        phone: clean,
        email: null,
        tower: null,
        towerId: null,
        apartment: null,
        birthDate: null,
        authType: 'otp',
        passwordHash: null,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
      };
      await Storage.insert('residents', resident);
    } else {
      resident = await Storage.updateById('residents', resident.id, {
        lastLoginAt: new Date().toISOString(),
        authType: resident.authType || 'otp'
      });
    }

    // Guardar en el registro la vigencia de la membrecía (30 días por vitrina):
    // el registro del vendedor queda ligado a la duración de su membresía.
    const ownedMembership = await findMembershipEnd(clean);
    if (ownedMembership) {
      resident = (await Storage.updateById('residents', resident.id, {
        membershipExpiresAt: ownedMembership.membershipExpiresAt,
        sessionDays: ownedMembership.sessionDays
      })) || resident;
    }

    // La sesión del vendedor dura lo mismo que su membrecía (30 días), sin
    // cerrarse antes de tiempo.
    const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
    const token = signToken({ role: 'resident', residentId: resident.id, phone: clean }, SESSION_TTL_MS / 1000);
    setSessionCookie(res, token, SESSION_TTL_MS);
    res.json({
      success: true,
      message: 'Sesión iniciada.',
      data: { token, resident: toPublicProfile(resident) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al verificar el código', error: error.message });
  }
};

// Calcula el fin de membrecía del vendedor según sus vitrinas activas (30 días)
const findMembershipEnd = async (phone) => {
  const clean = normalizePhone(phone);
  const businesses = await Storage.read('businesses') || [];
  const now = Date.now();
  const ends = businesses
    .filter(b => normalizePhone(b.ownerPhone) === clean || normalizePhone(b.phone) === clean)
    .map(b => (b.expiresAt ? new Date(b.expiresAt).getTime() : 0))
    .filter(t => t > now);
  if (ends.length === 0) return null;
  const maxEnd = new Date(Math.max(...ends));
  return {
    membershipExpiresAt: maxEnd.toISOString(),
    sessionDays: Math.max(1, Math.round((maxEnd - now) / (24 * 60 * 60 * 1000)))
  };
};

// ---------- Utilidades de conjunto ----------
// POST /api/auth/logout — cierra la sesión (limpia la cookie httpOnly)
export const logout = (req, res) => {
  try {
    clearSessionCookie(res);
    res.json({ success: true, message: 'Sesión cerrada.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al cerrar sesión', error: error.message });
  }
};

// GET /api/auth/towers
export const getTowers = async (req, res) => {
  try {
    let config = await Storage.read('towers');
    const hasTowers = config && Array.isArray(config.towers) && config.towers.length > 0;
    if (!hasTowers) {
      await ensureTowersData();
      config = await Storage.read('towers');
    }
    res.json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener configuración de torres', error: error.message });
  }
};

// POST /api/auth/validate-apartment
export const validateApartmentEndpoint = async (req, res) => {
  try {
    const { tower, apartment, manzana } = req.body;
    const check = await validateApartment(tower, apartment, manzana);
    res.json({ success: check.valid, data: check });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al validar apartamento', error: error.message });
  }
};

// Devuelve solo los campos públicos del perfil (nunca el hash)
const toPublicProfile = (resident) => ({
  id: resident.id,
  fullName: resident.fullName,
  phone: resident.phone,
  email: resident.email,
  tower: resident.tower,
  towerId: resident.towerId,
  apartment: resident.apartment,
  manzana: resident.manzana,
  role: resident.role,
  deliveryAddress: resident.deliveryAddress,
  birthDate: resident.birthDate,
  authType: resident.authType
});
