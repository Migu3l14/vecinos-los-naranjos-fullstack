import { defineConfig } from 'cypress';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORDERS_FILE = path.join(__dirname, 'backend', 'data', 'orders.json');

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
      });
    },
  },
});
