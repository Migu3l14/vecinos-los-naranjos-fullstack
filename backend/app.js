import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import YAML from 'yaml';
import fs from 'fs';
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
import adminRoutes from './routes/adminRoutes.js';
import { runSeeds } from './db/seed.js';
import { noStore } from './middleware/cache.js';

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
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdn.tailwindcss.com", "https://checkout.wompi.co"],
      "style-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      "img-src": ["'self'", "data:", "blob:", "https:"],
      "font-src": ["'self'", "data:", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      "connect-src": ["'self'", "https:"],
      "frame-src": ["'self'", "https://checkout.wompi.co"],
    }
  }
}));

// CORS: solo orígenes permitidos (mismo dominio y APP_URL)
const allowedOrigins = new Set([
  (ENV.APP_URL || '').replace(/\/$/, ''),
  `http://localhost:${PORT}`,
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://vecinos-los-naranjos-fullstack.vercel.app'
]);
const corsOptions = {
  origin(origin, callback) {
    // Permitir sin origen (curl, apps nativas, mismo-origen)
    if (!origin) return callback(null, true);
    const normalized = origin.replace(/\/$/, '');
    if (allowedOrigins.has(normalized)) return callback(null, true);
    if (isProd) return callback(new Error('Origen no permitido por CORS'));
    return callback(null, true);
  },
  credentials: true, // habilita el envío de la cookie de sesión httpOnly
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with'],
  exposedHeaders: [],
  maxAge: 86400
};
app.use(cors(corsOptions));

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
// Los webhooks de la pasarela llegan desde servidores de Wompi compartidos entre
// muchos comercios. Limitarlos por IP haría que un reintento reciba 429 y el pago
// se pierda sin confirmar, así que quedan fuera del límite. La defensa real de
// estas rutas es la verificación de firma del checksum, no el rate limit.
const WEBHOOK_PATHS = ['/api/subscriptions/webhook-wompi', '/api/payments/wompi-webhook'];
const isWebhookRequest = (req) => {
  const fullPath = String(req.originalUrl || '').split('?')[0].replace(/\/+$/, '');
  return WEBHOOK_PATHS.includes(fullPath);
};
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method) || isWebhookRequest(req),
  message: { success: false, message: 'Demasiadas peticiones. Intenta de nuevo más tarde.' }
});

// Servir los archivos estáticos del Frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Imágenes subidas por los usuarios (portadas, productos y ofertas)
app.use('/uploads', express.static(process.env.UPLOADS_DIR || path.join(__dirname, 'uploads')));

// Por defecto, ninguna respuesta de la API se cachea (puede contener datos de
// sesión). Las lecturas públicas sobreescriben esto con cachePublic() en su ruta.
app.use('/api', noStore());

// Rutas de la API REST
app.use('/api/categories', categoryRoutes);
app.use('/api/offers', writeLimiter, offerRoutes);
app.use('/api/businesses', writeLimiter, businessRoutes);
app.use('/api/subscriptions', writeLimiter, subscriptionRoutes);
app.use('/api/join-requests', writeLimiter, joinRoutes);
app.use('/api/payments', writeLimiter, paymentRoutes);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/pqrs', writeLimiter, pqrsRoutes);
app.use('/api/orders', writeLimiter, orderRoutes);
app.use('/api/uploads', writeLimiter, uploadRoutes);
app.use('/api/stats', writeLimiter, statsRoutes);
app.use('/api/support', writeLimiter, supportRoutes);
app.use('/api/announcements', writeLimiter, announcementRoutes);
app.use('/api/admin', writeLimiter, adminRoutes);

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

// Documentación Swagger/OpenAPI
// Swagger UI se carga desde un CDN: en Vercel (serverless) los archivos estáticos
// de swagger-ui-dist no se empaquetan, y como el catch-all devuelve index.html,
// el navegador recibía HTML en lugar de JS y la página quedaba en blanco.
try {
  const openApiPath = path.join(__dirname, '../openapi.yaml');
  const openApiFile = fs.readFileSync(openApiPath, 'utf8');
  const swaggerDocument = YAML.parse(openApiFile);

  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(swaggerDocument);
  });

  const SWAGGER_CDN = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14';
  app.get(['/api-docs', '/api-docs/'], (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Vecinos Los Naranjos - API Docs</title>
  <link rel="stylesheet" href="${SWAGGER_CDN}/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${SWAGGER_CDN}/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function () {
      window.ui = SwaggerUIBundle({
        url: '/api-docs.json',
        dom_id: '#swagger-ui',
        deepLinking: true
      });
    };
  </script>
</body>
</html>`);
  });
} catch (e) {
  console.warn('No se pudo cargar openapi.yaml para Swagger UI:', e.message);
}

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

await runSeeds();

export default app;