// Módulo Compartir: enlace + QR de la página (frontend/vanilla, sin backend).
// Genera el QR con la URL actual (window.location.href) para que se actualice solo
// al migrar de dominio (Vercel → GoDaddy).

const $share = (id) => document.getElementById(id);

// Genera la URL para compartir por WhatsApp con el enlace de la página
function buildWhatsAppShareUrl() {
  const msg = `Descubre el comercio de Los Naranjos, Jamundí: ${window.location.href}`;
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

// Copia el enlace al portapapeles (con fallback para navegadores sin Clipboard API)
async function copyShareLink() {
  const input = $share('shareUrlInput');
  const okMsg = $share('copyShareMsg');
  const errMsg = $share('copyShareErr');
  const text = input ? input.value : window.location.href;

  okMsg.classList.add('hidden');
  errMsg.classList.add('hidden');

  let done = false;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      done = true;
    } catch (e) {
      done = false;
    }
  }
  if (!done) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      done = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) {
      done = false;
    }
  }

  if (done && okMsg) okMsg.classList.remove('hidden');
  else if (errMsg) {
    errMsg.textContent = 'No se pudo copiar. Copia el enlace manualmente.';
    errMsg.classList.remove('hidden');
  }
}

// Genera el QR y habilita descarga/WhatsApp
async function renderShareContent() {
  const url = window.location.href;
  const urlInput = $share('shareUrlInput');
  const img = $share('shareQrImg');
  const box = $share('shareQrBox');
  const dlBtn = $share('downloadQrBtn');
  const waBtn = $share('shareWhatsAppBtn');

  if (urlInput) urlInput.value = url;
  if (waBtn) waBtn.href = buildWhatsAppShareUrl();

  if (typeof window.qrcode !== 'function') {
    if (box) {
      box.innerHTML = '<p class="text-[11px] text-red-600 font-bold text-center p-3">No se pudo cargar el generador de QR. Revisa tu conexión y recarga la página.</p>';
    }
    return;
  }

  try {
    const qr = window.qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const dataUrl = qr.createDataURL(6, 12);
    if (img) {
      img.src = dataUrl;
      img.removeAttribute('hidden');
      img.classList.remove('hidden');
    }
    if (box) box.innerHTML = '';
    if (dlBtn) {
      dlBtn.href = dataUrl;
      dlBtn.classList.remove('pointer-events-none', 'opacity-50');
    }
  } catch (err) {
    console.error('[SHARE] Error generando QR:', err);
    if (box) {
      box.innerHTML = '<p class="text-[11px] text-red-600 font-bold text-center p-3">No se pudo generar el QR. Inténtalo de nuevo.</p>';
    }
  }
}

// Abre el modal de compartir y regenera el QR con la URL actual
function openShareModal() {
  const modal = $share('shareModal');
  if (!modal) return;
  $share('copyShareMsg')?.classList.add('hidden');
  $share('copyShareErr')?.classList.add('hidden');
  modal.classList.remove('hidden');
  renderShareContent();
}

function closeShareModal() {
  const modal = $share('shareModal');
  if (modal) modal.classList.add('hidden');
}

// Exportados para app.js (bindings centralizados en setupEventListeners)
export { openShareModal, closeShareModal, copyShareLink };

window.openShareModal = openShareModal;
window.closeShareModal = closeShareModal;
window.copyShareLink = copyShareLink;