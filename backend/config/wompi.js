import ENV, { hasRealWompi } from './env.js';

/**
 * Configuración central de la pasarela Wompi (Colombia - COP).
 * Solo se usa la pasarela real cuando hay llaves configuradas;
 * de lo contrario el sistema cae al flujo simulado (dev).
 */
export const WompiConfig = {
  // Entorno: 'sandbox' (pruebas) o 'prod' (producción)
  environment: ENV.WOMPI_ENV,

  // Monto de la membresía en pesos colombianos (COP)
  membershipAmountCOP: 31600,

  // La única moneda soportada por Wompi
  currency: 'COP',

  // -> Url base de la API de Wompi según ambiente
  apiBase: ENV.WOMPI_ENV === 'prod'
    ? 'https://production.wompi.co/v1'
    : 'https://sandbox.wompi.co/v1',

  // Script del Widget Checkout
  widgetScript: 'https://checkout.wompi.co/widget.js',

  // URL a la que Wompi redirige al terminar la transacción
  redirectUrl: `${ENV.APP_URL}/pagos/resultado`,

  // Llaves
  publicKey: ENV.WOMPI_PUBLIC_KEY,
  privateKey: ENV.WOMPI_PRIVATE_KEY,
  integritySecret: ENV.WOMPI_INTEGRITY_SECRET,
  eventsSecret: ENV.WOMPI_EVENTS_SECRET,

  // Indica si la integración real está disponible
  isActive: hasRealWompi,
};

export default WompiConfig;
