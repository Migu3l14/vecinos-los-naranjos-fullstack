// Módulo de integración con el Widget Checkout de Wompi (Colombia - COP)
// Carga el widget una sola vez y expone un método para abrirlo con los
// parámetros de la transacción generados por el backend.

let widgetScriptLoaded = false;

/**
 * Asegura que el script del Widget esté cargado en la página.
 * (Normalmente ya se carga por el <script> en el HTML, pero esta función
 * garantiza que el constructor WidgetCheckout exista antes de usarlo).
 */
function ensureWidgetScript() {
  return new Promise((resolve, reject) => {
    if (widgetScriptLoaded || (typeof window.WidgetCheckout !== 'undefined')) {
      widgetScriptLoaded = true;
      return resolve();
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.wompi.co/widget.js';
    script.async = true;
    script.onload = () => { widgetScriptLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('No se pudo cargar el widget de Wompi.'));
    document.head.appendChild(script);
  });
}

/**
 * Abre el Widget Checkout de Wompi.
 * @param {Object} checkout - Datos de la transacción generados por el backend:
 *   { publicKey, reference, amountInCents, signature, currency, payerName, payerEmail, payerPhone }
 * @param {Function} onResult - Callback con el resultado tras cerrar el widget.
 *   Recibe { transaction } al completarse.
 */
export async function openWompiCheckout(checkout, onResult) {
  try {
    await ensureWidgetScript();
  } catch (err) {
    console.error('Error cargando widget Wompi:', err);
    if (onResult) onResult({ error: err.message });
    return;
  }

  if (typeof window.WidgetCheckout === 'undefined') {
    console.error('WidgetCheckout no está disponible.');
    if (onResult) onResult({ error: 'WidgetCheckout no disponible' });
    return;
  }

  const config = {
    currency: checkout.currency || 'COP',
    amountInCents: checkout.amountInCents,
    reference: checkout.reference,
    publicKey: checkout.publicKey,
  };

  // Firma de integridad (solo presente cuando hay Wompi configurado)
  if (checkout.signature) {
    config.signature = { integrity: checkout.signature };
  }

  // Datos del cliente (opcionales)
  const customerData = {};
  if (checkout.payerEmail) customerData.email = checkout.payerEmail;
  if (checkout.payerName) customerData.fullName = checkout.payerName;
  if (checkout.payerPhone) {
    customerData.phoneNumber = checkout.payerPhone.replace(/\D/g, '');
  }
  if (Object.keys(customerData).length) config.customerData = customerData;

  // URL de redirección opcional
  if (checkout.redirectUrl) config.redirectUrl = checkout.redirectUrl;

  try {
    const widget = new window.WidgetCheckout(config);
    widget.open((result) => {
      if (result && result.transaction) {
        onResult({ transaction: result.transaction });
      } else {
        onResult({ canceled: true });
      }
    });
  } catch (err) {
    console.error('Error abriendo WidgetCheckout:', err);
    if (onResult) onResult({ error: err.message });
  }
}

export default { openWompiCheckout };
