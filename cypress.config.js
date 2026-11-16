import { defineConfig } from 'cypress';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'backend', 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const BUSINESSES_FILE = path.join(DATA_DIR, 'businesses.json');
const RESIDENTS_FILE = path.join(DATA_DIR, 'residents.json');

// Cypress · Sesión 9 (Calidad del Software).
// Los tests corren SOLO en local contra el servidor de desarrollo (no en Vercel).
export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || 'http://localhost:4000',
    specPattern: 'cypress/e2e/**/*.cy.js',
    supportFile: false,
    video: false,
    screenshotOnRunFailure: true,
    setupNodeEvents(on) {
      on('task', {
        // Elimina un pedido de prueba del almacén local (JSON) para no ensuciar datos.
        removeOrder(orderId) {
          try {
            if (!fs.existsSync(ORDERS_FILE)) return 0;
            const lista = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8') || '[]');
            if (!Array.isArray(lista)) return 0;
            const filtrada = lista.filter((o) => o.id !== orderId && o.orderId !== orderId);
            const removidos = lista.length - filtrada.length;
            if (removidos > 0) fs.writeFileSync(ORDERS_FILE, JSON.stringify(filtrada, null, 2));
            return removidos;
          } catch {
            return -1;
          }
        },
        // Elimina una vitrina de prueba del almacén local (JSON).
        removeBusiness(businessId) {
          try {
            if (!fs.existsSync(BUSINESSES_FILE)) return 0;
            const lista = JSON.parse(fs.readFileSync(BUSINESSES_FILE, 'utf8') || '[]');
            if (!Array.isArray(lista)) return 0;
            const filtrada = lista.filter((b) => b.id !== businessId);
            const removidos = lista.length - filtrada.length;
            if (removidos > 0) fs.writeFileSync(BUSINESSES_FILE, JSON.stringify(filtrada, null, 2));
            return removidos;
          } catch {
            return -1;
          }
        },
        // Elimina un residente de prueba (por teléfono) del almacén local (JSON).
        removeResident(phone) {
          try {
            if (!fs.existsSync(RESIDENTS_FILE)) return 0;
            const lista = JSON.parse(fs.readFileSync(RESIDENTS_FILE, 'utf8') || '[]');
            if (!Array.isArray(lista)) return 0;
            const clean = String(phone || '').replace(/\D/g, '');
            const filtrada = lista.filter((r) => !String(r.phone || '').replace(/\D/g, '').endsWith(clean.slice(-10)));
            const removidos = lista.length - filtrada.length;
            if (removidos > 0) fs.writeFileSync(RESIDENTS_FILE, JSON.stringify(filtrada, null, 2));
            return removidos;
          } catch {
            return -1;
          }
        },
      });
    },
  },
});
