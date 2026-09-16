import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import ENV, { isUsingDefaultJwtSecret } from './config/env.js';

import categoryRoutes from './routes/categoryRoutes.js';
import offerRoutes from './routes/offerRoutes.js';
import businessRoutes from './routes/businessRoutes.js';
import joinRoutes from './routes/joinRoutes.js';
import subscriptionRoutes from './routes/subscriptionRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import authRoutes from './routes/authRoutes.js';
import pqrsRoutes from './routes/pqrsRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import statsRoutes from './routes/statsRoutes.js';
import supportRoutes from './routes/supportRoutes.js';
import announcementRoutes from './routes/announcementRoutes.js';

// Guarda de seguridad: en producción no se puede arrancar con el secreto JWT por defecto.
if (ENV.NODE_ENV === 'production' && isUsingDefaultJwtSecret) {
  console.error('❌ [SEGURIDAD] JWT_SECRET sigue siendo el de desarrollo. Configura uno aleatorio en .env antes de arrancar en producción.');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;
const isProd = ENV.NODE_ENV === 'production';

// ---------- Middlewares de seguridad ----------
app.use(helmet({
  contentSecurityPolicy: isProd ? {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'script-src': ["'self'", 'https://cdn.tailwindcss.com', 'https://cdn.jsdelivr.net', 'https://checkout.wompi.co', 'https://js.stripe.com'],
      'img-src': ["'self'", 'data:', 'https:', 'https://images.unsplash.com'],
      'connect-src': ["'self'", 'https://production.wompi.co', 'https://sandbox.wompi.co', 'https://api.wompi.co']
    }
  } : false
}));

// CORS: solo orígenes permitidos (mismo dominio y APP_URL)
const allowedOrigins = new Set([
  (ENV.APP_URL || '').replace(/\/$/, ''),
  `http://localhost:${PORT}`,
  'http://127.0.0.1:3000'
]);
app.use(cors({
  origin(origin, callback) {
    // Permitir sin origen (curl, apps nativas, mismo-origen) en cualquier entorno
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    if (isProd) return callback(new Error('Origen no permitido por CORS'));
    return callback(null, true);
  },
  credentials: true // habilita el envío de la cookie de sesión httpOnly
}));

// Parseo de cookies (necesario para la sesión httpOnly)
app.use(cookieParser());

// Límite de tamaño del cuerpo de las peticiones
app.use(express.json({ limit: '100kb' }));

// Límite de intentos en endpoints sensibles (login/registro/creación)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
  message: { success: false, message: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' }
});
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
  message: { success: false, message: 'Demasiadas peticiones. Intenta de nuevo más tarde.' }
});

// Servir los archivos estáticos del Frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Imágenes subidas por los usuarios (portadas, productos y ofertas)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rutas de la API REST
app.use('/api/categories', categoryRoutes);
app.use('/api/offers', writeLimiter, offerRoutes);
app.use('/api/businesses', writeLimiter, businessRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/join-requests', joinRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/pqrs', writeLimiter, pqrsRoutes);
app.use('/api/orders', writeLimiter, orderRoutes);
app.use('/api/uploads', writeLimiter, uploadRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/announcements', announcementRoutes);

// Estado de la API (Healthcheck)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    project: 'Vitrina Digital Los Naranjos',
    community: 'Jamundí, Valle (Manzanas 1 a 6)',
    subscriptionDurationDays: 30,
    timestamp: new Date().toISOString()
  });
});

// 404 JSON para rutas API desconocidas
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'Recurso no encontrado.' });
});

// Redirigir cualquier otra ruta no-API al Frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Manejador central de errores (no filtra detalles internos en producción)
app.use((err, req, res, next) => {
  if (err && err.message && err.message.includes('Origen no permitido')) {
    return res.status(403).json({ success: false, message: 'Origen no permitido.' });
  }
  console.error('[ERROR]', err?.message, err?.stack || '');
  if (res.headersSent) return next(err);
  res.status(err?.status || 500).json({
    success: false,
    message: isProd ? 'Error interno del servidor.' : (err?.message || 'Error interno del servidor.')
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🍊 Vitrina Digital Los Naranjos — Fullstack Server`);
  console.log(`🚀 Frontend: http://localhost:${PORT}`);
  console.log(`📡 API REST: http://localhost:${PORT}/api/businesses`);
  console.log(`💳 Membresías: http://localhost:${PORT}/api/subscriptions/checkout`);
  console.log(`💳 Wompi Checkout: http://localhost:${PORT}/api/payments/wompi-checkout`);
  console.log(`📲 Wompi Webhook:  http://localhost:${PORT}/api/payments/wompi-webhook`);
  console.log(`🔐 Admin Login:    http://localhost:${PORT}/api/auth/admin/login`);
  console.log(`🙋 Auth Residente: http://localhost:${PORT}/api/auth/resident/login`);
  console.log(`📋 PQRS:           http://localhost:${PORT}/api/pqrs`);
  console.log(`🛒 Pedidos:        http://localhost:${PORT}/api/orders`);
  console.log(`====================================================`);
});