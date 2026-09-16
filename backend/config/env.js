import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carga las variables de entorno desde el .env en la raíz del proyecto.
// En producción (GoDaddy) se pueden usar las variables de entorno del servidor,
// que tienen prioridad sobre el archivo .env.
dotenv.config({ path: path.join(__dirname, '../../.env'), override: false });

export const ENV = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 4000,
  APP_URL: process.env.APP_URL || `http://localhost:${process.env.PORT || 4000}`,

  // URLs de la pasarela Wompi (se usa solo si hay llaves configuradas)
  WOMPI_ENV: process.env.WOMPI_ENV || 'sandbox',
  WOMPI_PUBLIC_KEY: process.env.WOMPI_PUBLIC_KEY || '',
  WOMPI_PRIVATE_KEY: process.env.WOMPI_PRIVATE_KEY || '',
  WOMPI_INTEGRITY_SECRET: process.env.WOMPI_INTEGRITY_SECRET || '',
  WOMPI_EVENTS_SECRET: process.env.WOMPI_EVENTS_SECRET || '',

  // Administración (login admin con JWT)
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@losnaranjos.com',
  // Contraseña en texto plano SOLO como fallback de desarrollo.
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin123',
  // Hash bcrypt de la contraseña del admin (recomendado en producción).
  ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH || '',

  // Canales de soporte para emprendedores (se muestran en la portada).
  // Dejadlos vacíos para no publicar el canal hasta tenerlo listo.
  SUPPORT_WHATSAPP: process.env.SUPPORT_WHATSAPP || '',
  SUPPORT_EMAIL: process.env.SUPPORT_EMAIL || '',

  // Secreto JWT (obligatorio cambiarlo fuera de desarrollo)
  JWT_SECRET: process.env.JWT_SECRET || 'los-naranjos-dev-secret-change-me',

  // Estructura del conjunto (configurable; por defecto genérica)
  TOTAL_APARTMENTS: parseInt(process.env.TOTAL_APARTMENTS, 10) || 2160,
};

// Indica si todavía se usa el secreto de desarrollo (peligroso en producción).
export const isUsingDefaultJwtSecret = ENV.JWT_SECRET === 'los-naranjos-dev-secret-change-me';

// Indica si la integración real de Wompi está activa (requiere llave pública + secretos)
export const hasRealWompi = Boolean(
  ENV.WOMPI_PUBLIC_KEY &&
  ENV.WOMPI_INTEGRITY_SECRET &&
  ENV.WOMPI_EVENTS_SECRET
);

export default ENV;
