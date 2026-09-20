import { API } from './api.js';
import { UI } from './ui.js';
import { WhatsAppHelper } from './whatsapp.js';
import { openWompiCheckout } from './wompi.js';
import { setupImageUpload, resetImageUpload } from './upload.js';

// Atajo para document.getElementById
const $ = (id) => document.getElementById(id);

// Estado global de la aplicación cliente
const state = {
  categories: [],
  offers: [],
  businesses: [],
  currentCategory: 'all',
  currentManzana: 'all',
  currentSearch: '',
  selectedBusiness: null,
  selectedOffer: null,
  
  // Estado temporal del proceso de registro y pago
  newBizData: null,
  createdBiz: null,
  currentReceipt: null,
  managingBiz: null,

  // Estado de la transacción Wompi / pago
  currentPayment: null,        // { transactionId, reference, widgetActive, ... }
  paymentPollTimer: null,

  // Estado del checkout dual (identidad + pedido)
  checkoutCtx: null,           // { business, products: [...], mode: 'login'|'guest', resident: {...} }
  towersList: []
};

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
  setupActionButtons();
  setupEventListeners();
  setupImageUpload('regCoverImg');
  setupImageUpload('prod1Img');
  setupImageUpload('prod2Img');
  setupModalScrollLock();
  await loadInitialData();
  maybeShowEntryModal();
  renderMiManzana();
  bindMmDemoToggle();
  bindMmAccordion();
});

// Muestra un aviso con botón Reintentar cuando falla la carga inicial
function setLoadError(msg) {
  const badge = document.getElementById('businessCountBadge');
  const list = document.getElementById('businessList');
  if (badge) badge.textContent = msg || 'Sin conexión con el servidor';
  if (msg && list) {
    list.innerHTML = `
      <div class="col-span-full text-center py-10 space-y-3">
        <p class="text-[11px] text-slate-400">${msg}</p>
        <button id="retryLoadBtn" class="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl touch-btn">Reintentar</button>
      </div>`;
    const retry = document.getElementById('retryLoadBtn');
    if (retry) retry.addEventListener('click', () => {
      badge.textContent = 'Cargando...';
      list.innerHTML = '';
      loadInitialData();
    });
  }
}

// Cargar datos desde la API REST
async function loadInitialData() {
  try {
    const [categories, offers, businesses] = await Promise.all([
      API.getCategories(),
      API.getOffers(),
      API.getBusinesses()
    ]);

    state.categories = categories;
    state.offers = offers;
    state.businesses = businesses;

    UI.renderCategories(state.categories, state.currentCategory, handleCategorySelect);
    UI.renderOffers(state.offers, handleOpenOffer, handleContactOffer);
    await fetchFilteredBusinesses();

    const todayLabel = document.getElementById('offersDateLabel');
    if (todayLabel) {
      todayLabel.innerText = `Hoy · ${new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}`;
    }

    loadStatsAndRecordVisit();
    verifySession();
    updateMyVitrinaButton();
  } catch (e) {
    console.error('Fallo al cargar datos iniciales:', e);
    setLoadError('No pudimos cargar las vitrinas. Revisa tu conexión.');
  }
}

// Verifica en el servidor que la sesión guardada siga siendo válida.
// Solo limpia el perfil si el token es realmente inválido (401); si hay error de
// red no borra nada, para no volver a preguntar los datos a quien ya ingresó.
async function verifySession() {
  const hasToken = API.hasAnySession();
  if (!hasToken) return;
  const me = await API.getMe();
  if (me && me.reason === 'unauthorized') {
    API.logoutResident();
    API.logoutAdmin();
  }
}

// Actualiza el botón del header: "Mi Vitrina" si el usuario tiene una, "Crear mi Vitrina" si no
async function updateMyVitrinaButton() {
  const btn = document.getElementById('myVitrinaBtn');
  if (!btn) return;
  if (!API.isResidentLoggedIn()) return;
  try {
    const mine = await API.getMyBusinesses();
    btn.title = mine && mine.length > 0 ? 'Mi Vitrina' : 'Crear mi Vitrina';
  } catch (e) {
    // sin cambios si falla la consulta
  }
}

// Configurar escuchadores de eventos
function setupEventListeners() {
  // Selector de manzana
  const manzanaSelect = document.getElementById('manzanaFilter');
  if (manzanaSelect) {
    manzanaSelect.addEventListener('change', (e) => {
      state.currentManzana = e.target.value;
      fetchFilteredBusinesses();
    });
  }

  // Buscador por necesidad
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearchBtn');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.currentSearch = e.target.value;
      if (clearBtn) {
        clearBtn.classList.toggle('hidden', state.currentSearch.trim().length === 0);
      }
      fetchFilteredBusinesses();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      state.currentSearch = '';
      clearBtn.classList.add('hidden');
      fetchFilteredBusinesses();
    });
  }

  // Botón abrir modal registro de vitrina
  const openRegisterBtn = document.getElementById('openRegisterModalBtn');
  if (openRegisterBtn) {
    openRegisterBtn.addEventListener('click', () => {
      resetRegisterWizard();
      document.getElementById('registerWizardModal').classList.remove('hidden');
    });
  }

  // Botones del Asistente de Registro (Wizard)
  const step1NextBtn = document.getElementById('step1NextBtn');
  if (step1NextBtn) step1NextBtn.addEventListener('click', handleStep1Next);

  const step2BackBtn = document.getElementById('step2BackBtn');
  if (step2BackBtn) step2BackBtn.addEventListener('click', () => showWizardStep(1));

  const step2NextBtn = document.getElementById('step2NextBtn');
  if (step2NextBtn) step2NextBtn.addEventListener('click', handleStep2Submit);

  const processPaymentBtn = document.getElementById('processPaymentBtn');
  if (processPaymentBtn) processPaymentBtn.addEventListener('click', handleProcessPayment);

  // Gestión de vitrina: Buscar por teléfono
  const searchManageBtn = document.getElementById('searchManageBtn');
  if (searchManageBtn) searchManageBtn.addEventListener('click', handleSearchManagePhone);

  const renewManageBtn = document.getElementById('renewManageBtn');
  if (renewManageBtn) renewManageBtn.addEventListener('click', handleRenewFromManage);

  // Botón del modal de resultado de pago
  const paymentResultBtn = document.getElementById('paymentResultBtn');
  if (paymentResultBtn) {
    paymentResultBtn.addEventListener('click', () => {
      const modal = document.getElementById('paymentResultModal');
      modal.classList.add('hidden');
      // Si fue exitoso, abrir la vitrina / cerrar el wizard
      if (state.currentReceipt && state.createdBiz) {
        closeRegisterWizard();
        handleOpenProfile(state.createdBiz.id);
      }
    });
  }

  // Botón abrir modal PQRS
  const openPqrsBtn = document.getElementById('openPqrsModalBtn');
  if (openPqrsBtn) openPqrsBtn.addEventListener('click', openPqrsModal);

  // Botón abrir modal Soporte
  const openSupportBtn = document.getElementById('openSupportModalBtn');
  if (openSupportBtn) openSupportBtn.addEventListener('click', openSupportModal);

  // Botón Contactar por WhatsApp del modal Soporte
  const supportWaBtn = document.getElementById('supportWhatsappBtn');
  if (supportWaBtn) supportWaBtn.addEventListener('click', handleSupportWhatsApp);

  // Botón y enlaces del modal Términos y Condiciones
  const openTermsBtn = document.getElementById('openTermsBtn');
  if (openTermsBtn) openTermsBtn.addEventListener('click', openTermsModal);
  document.querySelectorAll('.open-terms-link').forEach(a => a.addEventListener('click', openTermsModal));

  // Modal ingreso por QR/link: rol, datos y validación
  document.querySelectorAll('.entry-role-btn').forEach(b => b.addEventListener('click', () => {
    entrySelectedRole = b.dataset.role;
    updateEntryRoleUI();
  }));
  const entrySubmitBtn = document.getElementById('entrySubmitBtn');
  if (entrySubmitBtn) entrySubmitBtn.addEventListener('click', () => {
    if (entryPhase === 'phone') handleEntryLookup();
    else handleEntrySubmit();
  });
  const entryChangePhone = document.getElementById('entryChangePhone');
  if (entryChangePhone) entryChangePhone.addEventListener('click', () => {
    entryKnown = null;
    document.getElementById('entryTerms').checked = false;
    setEntryPhase('phone');
  });
  const entryMzSelect = document.getElementById('entryMz');
  if (entryMzSelect) {
    entryMzSelect.addEventListener('change', () => {
      ensureTowers(['entryTower'], { manzana: entryMzSelect.value, placeholder: 'Selecciona tu torre', onlyFromManzana: true });
    });
  }

  // Checkout Dual
  const coTabLogin = document.getElementById('checkoutTabLogin');
  if (coTabLogin) coTabLogin.addEventListener('click', () => switchCheckoutMode('login'));
  const coTabGuest = document.getElementById('checkoutTabGuest');
  if (coTabGuest) coTabGuest.addEventListener('click', () => switchCheckoutMode('guest'));
  const coLoginSubmit = document.getElementById('coLoginSubmit');
  if (coLoginSubmit) coLoginSubmit.addEventListener('click', handleCheckoutLogin);
  const coConfirm = document.getElementById('checkoutConfirmBtn');
  if (coConfirm) coConfirm.addEventListener('click', handleCheckoutConfirm);

  // PQRS submit + tipo
  const pqrsSubmit = document.getElementById('pqrsSubmitBtn');
  if (pqrsSubmit) pqrsSubmit.addEventListener('click', handlePqrsSubmit);
  document.querySelectorAll('.pqrs-tipo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedPqrsTipo = btn.dataset.tipo;
      resetPqrsTipo();
    });
  });

  // Cierres de modales (X / Cerrar / Volver) — bindeados sin onclick inline
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const fn = window[btn.dataset.close];
      if (typeof fn === 'function') fn();
    });
  });

  // Atajo "Renovar Vitrina" del panel del emprendedor (abre directamente el modal de gestión)
  const renewShortcutBtn = document.getElementById('renewShortcutBtn');
  if (renewShortcutBtn) renewShortcutBtn.addEventListener('click', () => {
    document.getElementById('managePhoneInput').value = '';
    document.getElementById('manageResultSection').classList.add('hidden');
    document.getElementById('manageModal').classList.remove('hidden');
  });
}

// ==========================================
// FILTROS Y NAVEGACIÓN DEL DIRECTORIO
// ==========================================
// Directorio comercial (los comunicados ahora viven en el módulo privado "Mi Manzana")
async function fetchFilteredBusinesses() {
  const params = {};
  if (state.currentCategory !== 'all') params.category = state.currentCategory;
  if (state.currentManzana !== 'all') params.manzana = state.currentManzana;
  if (state.currentSearch.trim() !== '') params.q = state.currentSearch;

  let filtered;
  try {
    filtered = await API.getBusinesses(params);
  } catch (e) {
    console.error('Fallo al filtrar vitrinas:', e);
    setLoadError('No pudimos cargar las vitrinas. Revisa tu conexión.');
    return;
  }

  state.businesses = filtered;
  renderBusinessList();
}

function renderBusinessList() {
  UI.renderBusinesses(state.businesses, handleOpenProfile, handleQuickWhatsApp);
}

window.closeAnnStory = () => document.getElementById('annStoryModal').classList.add('hidden');

// ============================================
// MÓDULO "🏠 MI MANZANA" (antiguo bloque "Comunicados oficiales")
// Espacio comunitario PRIVADO por manzana. FASE VISUAL: los datos son de
// ejemplo (mock) para organizar la apariencia. El backend con roles,
// lecturas y privacidad por manzana llega en la fase 2.
// ============================================
const MM_CAT_EMOJI = { aviso: '🚨', comunicado: '🔔', actividad: '📅', documento: '📄' };

const MM_MOCK = [
  { id: 'mm-1', categoria: 'aviso', importante: true, title: 'Corte de agua este sábado', body: 'El sábado 3 de octubre la administración hará mantenimiento de tuberías desde las 9:00 am hasta la 1:00 pm. Agradecemos tu comprensión y te pedimos almacenar agua con anticipación.', fecha: '28 sept', evento: 'Sáb 3 oct · 9:00 am - 1:00 pm', media: '', read: false },
  { id: 'mm-2', categoria: 'aviso', importante: true, title: 'Fumigación en zonas comunes', body: 'Se realizará fumigación en pasillos, ascensores y zonas verdes. Evita el paso por estas áreas mientras se realiza el procedimiento.', fecha: '25 sept', evento: '', media: '', read: true },
  { id: 'mm-3', categoria: 'comunicado', importante: false, title: 'Nuevo punto de reciclaje', body: 'Instalamos un punto de reciclaje ecológico frente a la torre 5. Deposita vidrio, cartón y plástico en el contenedor que corresponde.', fecha: '26 sept', evento: '', media: '', read: false },
  { id: 'mm-4', categoria: 'comunicado', importante: false, title: 'Reglamento interno actualizado', body: 'El reglamento de convivencia fue actualizado. Puedes consultar la versión completa en la sección Documentos.', fecha: '22 sept', evento: '', media: '', read: true },
  { id: 'mm-5', categoria: 'actividad', importante: false, title: 'Asamblea general de residentes', body: 'Te invitamos a la asamblea ordinaria. Puntos: presupuesto 2027, mejoras en zonas comunes y elección del comité de convivencia.', fecha: '1 oct', evento: 'Sáb 10 oct · 10:00 am', media: '', read: false },
  { id: 'mm-6', categoria: 'actividad', importante: false, title: 'Mantenimiento de ascensores', body: 'Revisión técnica de los ascensores por 2 horas. Habrá cortes intermitentes del servicio.', fecha: '24 sept', evento: 'Mar 6 oct · 8:00 am', media: '', read: true },
  { id: 'mm-7', categoria: 'documento', importante: false, title: 'Circular 12 - Seguridad en el edificio', body: 'Indicaciones de seguridad y control de acceso de visitantes.', fecha: '20 sept', evento: '', media: { tipo: 'pdf', url: '#' }, read: false },
  { id: 'mm-8', categoria: 'documento', importante: false, title: 'Acta asamblea ordinaria', body: 'Acta completa con los acuerdos tomados en la última asamblea.', fecha: '15 sept', evento: '', media: { tipo: 'pdf', url: '#' }, read: true }
];

let mmState = {
  mode: API.isResidentLoggedIn() ? 'resident' : 'guest',
  manzana: (API.getStoredResidentProfile() && API.getStoredResidentProfile().manzana) || '3'
};

function mmUnreadCount() {
  return mmState.mode === 'resident' ? MM_MOCK.filter(i => !i.read).length : 0;
}

let mmOpen = false;

function applyMmAccordion() {
  const body = document.getElementById('mmAccordionBody');
  const chev = document.getElementById('mmChevron');
  const btn = document.getElementById('mmToggleBtn');
  if (body) body.style.maxHeight = mmOpen ? `${body.scrollHeight}px` : '0px';
  if (chev) chev.classList.toggle('rotate-180', mmOpen);
  if (btn) btn.setAttribute('aria-expanded', String(mmOpen));
}

function bindMmAccordion() {
  const btn = document.getElementById('mmToggleBtn');
  if (!btn) return;
  btn.addEventListener('click', () => { mmOpen = !mmOpen; applyMmAccordion(); });
}

function renderMiManzana() {
  const content = document.getElementById('miManzanaContent');
  if (!content) return;

  const badge = document.getElementById('mmUnreadBadge');
  const unread = mmUnreadCount();
  if (badge) {
    badge.classList.toggle('hidden', mmState.mode !== 'resident' || unread === 0);
    if (mmState.mode === 'resident') badge.textContent = `🔴 ${unread}`;
  }

  const demoGuest = document.getElementById('mmDemoGuest');
  const demoResident = document.getElementById('mmDemoResident');
  if (demoGuest) demoGuest.className = mmState.mode === 'guest' ? 'px-2.5 py-0.5 rounded-full bg-slate-900 text-white' : 'px-2.5 py-0.5 rounded-full text-slate-500';
  if (demoResident) demoResident.className = mmState.mode === 'resident' ? 'px-2.5 py-0.5 rounded-full bg-orange-500 text-white' : 'px-2.5 py-0.5 rounded-full text-slate-500';

  if (mmState.mode === 'guest') {
    content.innerHTML = mmGuestPanel();
    const btn = document.getElementById('mmLoginBtn');
    if (btn) btn.addEventListener('click', openEntryModal);
    applyMmAccordion();
    return;
  }

  content.innerHTML = [
    mmHeader(),
    mmSection('aviso', 'Avisos importantes', MM_MOCK.filter(i => i.categoria === 'aviso')),
    mmSection('comunicado', 'Comunicados recientes', MM_MOCK.filter(i => i.categoria === 'comunicado')),
    mmSection('actividad', 'Próximas actividades', MM_MOCK.filter(i => i.categoria === 'actividad')),
    mmSection('documento', 'Documentos', MM_MOCK.filter(i => i.categoria === 'documento'))
  ].join('');

  content.querySelectorAll('.mm-open').forEach(el => el.addEventListener('click', () => openMmDetail(el.dataset.id)));
  applyMmAccordion();
}

function bindMmDemoToggle() {
  const demoGuest = document.getElementById('mmDemoGuest');
  const demoResident = document.getElementById('mmDemoResident');
  if (demoGuest) demoGuest.addEventListener('click', () => { mmState.mode = 'guest'; renderMiManzana(); });
  if (demoResident) demoResident.addEventListener('click', () => { mmState.mode = 'resident'; renderMiManzana(); });
}

function mmGuestPanel() {
  return `
    <div class="bg-white border border-slate-100 rounded-2xl p-5 text-center shadow-sm space-y-3">
      <span class="text-3xl inline-block">🏠</span>
      <h3 class="text-sm font-extrabold text-slate-800">Esta sección es exclusiva para residentes</h3>
      <p class="text-[11px] text-slate-500 leading-snug">Tu administración publica aquí avisos, comunicados, actividades y documentos, solo para los vecinos de tu manzana.</p>
      <button id="mmLoginBtn" class="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-sm rounded-xl shadow touch-btn">
        <i class="fa-solid fa-right-to-bracket mr-1"></i> Iniciar sesión / Ingresar
      </button>
      <p class="text-[10px] text-slate-400">Ingresa con el mismo celular que usas en la Vitrina Digital.</p>
    </div>`;
}

function mmHeader() {
  const mz = escHtml(mmState.manzana);
  return `
    <div class="bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-2xl p-4 shadow-sm flex items-center justify-between gap-3">
      <div>
        <p class="text-[11px] font-bold text-orange-100">Comunidad privada · solo tu manzana</p>
        <h3 class="text-xl font-extrabold leading-tight mt-0.5">📍 Manzana ${mz}</h3>
        <p class="text-[11px] text-orange-100 font-medium mt-0.5">Administración Manzana ${mz}</p>
      </div>
      <a href="https://wa.me/57300123450${mz}" target="_blank" rel="noopener" class="bg-white/20 hover:bg-white/30 text-white px-3 py-2 rounded-xl text-[11px] font-extrabold flex items-center gap-1.5 whitespace-nowrap touch-btn">
        <i class="fa-brands fa-whatsapp text-sm"></i> Contacto
      </a>
    </div>
    <div class="bg-white border border-slate-100 rounded-2xl p-3 shadow-sm flex items-center gap-2 text-[11px] font-bold text-slate-600">
      <i class="fa-solid fa-phone text-orange-500"></i>
      <span>57 300 123 450${mz}</span>
      <span class="text-slate-300">·</span>
      <i class="fa-solid fa-envelope text-orange-500"></i>
      <span class="truncate">admin.manzana${mz}@losnaranjos.app</span>
    </div>`;
}

function mmSection(name, label, list) {
  const emoji = MM_CAT_EMOJI[name] || '📌';
  const body = list.length
    ? list.map(mmCard).join('')
    : `<div class="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4 text-center">
         <p class="text-lg mb-1">${emoji}</p>
         <p class="text-[11px] font-bold text-slate-500">Aún no hay comunicados en esta sección.</p>
       </div>`;
  return `
    <section class="bg-white border border-slate-100 rounded-2xl p-3.5 shadow-sm space-y-2.5">
      <div class="flex items-center justify-between">
        <h4 class="text-xs font-extrabold text-slate-800">${emoji} ${escHtml(label)}</h4>
        <span class="text-[10px] font-extrabold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">${list.length}</span>
      </div>
      ${body}
    </section>`;
}

function mmCard(item) {
  const estado = item.read
    ? '<span class="text-[9px] font-extrabold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full flex items-center gap-1"><i class="fa-solid fa-check"></i> Leído</span>'
    : '<span class="text-[9px] font-extrabold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full flex items-center gap-1">🔵 Nuevo</span>';
  const tag = item.importante
    ? '<span class="text-[9px] font-extrabold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">⭐ Importante</span>'
    : '';

  if (item.categoria === 'documento') {
    return `
      <div data-id="${item.id}" class="mm-open flex items-center gap-3 rounded-xl border border-slate-100 p-3 cursor-pointer touch-btn bg-white hover:bg-slate-50">
        <div class="w-11 h-11 shrink-0 rounded-xl bg-red-50 text-red-500 flex items-center justify-center text-lg"><i class="fa-solid fa-file-pdf"></i></div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap">${tag}${estado}</div>
          <p class="text-xs font-extrabold text-slate-800 leading-tight truncate mt-1">${escHtml(item.title)}</p>
          <p class="text-[10px] text-slate-500 font-medium mt-0.5">${escHtml(item.fecha)}</p>
        </div>
        <div class="shrink-0 text-[9px] font-extrabold text-orange-600">Ver / Descargar</div>
      </div>`;
  }

  return `
    <div data-id="${item.id}" class="mm-open flex gap-3 items-start rounded-xl border border-slate-100 p-3 cursor-pointer touch-btn bg-white hover:bg-slate-50">
      <div class="w-10 h-10 shrink-0 rounded-xl bg-orange-50 text-lg flex items-center justify-center">${MM_CAT_EMOJI[item.categoria] || '📌'}</div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5 flex-wrap">${tag}${estado}</div>
        <p class="text-xs font-extrabold text-slate-800 leading-tight mt-1">${escHtml(item.title)}</p>
        <p class="text-[11px] text-slate-500 leading-snug line-clamp-2 mt-0.5">${escHtml(item.body)}</p>
        <p class="text-[10px] font-bold text-orange-600 mt-1">${escHtml(item.evento || item.fecha)}</p>
      </div>
    </div>`;
}

function openMmDetail(id) {
  const item = MM_MOCK.find(i => i.id === id);
  if (!item) return;
  item.read = true;

  const modal = document.getElementById('annStoryModal');
  const content = document.getElementById('annStoryContent');
  const isDoc = item.categoria === 'documento';
  const media = isDoc
    ? `<a href="${escHtml((item.media && item.media.url) || '#')}" target="_blank" rel="noopener" class="w-full py-3 bg-red-50 text-red-600 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 touch-btn"><i class="fa-solid fa-file-pdf text-lg"></i> Ver documento PDF</a>`
    : (item.media ? `<img src="${escHtml(item.media)}" alt="${escHtml(item.title)}" class="w-full h-40 object-cover rounded-xl" />` : '');

  content.innerHTML = `
    <div class="bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 text-white flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="text-xl">${MM_CAT_EMOJI[item.categoria] || '📌'}</span>
        <span class="text-[10px] font-extrabold uppercase tracking-wider">Mi Manzana · Mz ${escHtml(mmState.manzana)}</span>
      </div>
      <button data-close="closeAnnStory" class="text-white/90 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center touch-btn"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="overflow-y-auto p-4 space-y-3 flex-1">
      <div class="flex items-center gap-1.5 flex-wrap">
        ${item.importante ? '<span class="text-[10px] font-extrabold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">⭐ Importante</span>' : ''}
        <span class="text-[10px] font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1"><i class="fa-solid fa-check"></i> Leído</span>
      </div>
      <h3 class="text-base font-extrabold text-slate-900 leading-tight">${escHtml(item.title)}</h3>
      <div class="text-[11px] font-bold text-slate-500 space-y-1">
        <p><i class="fa-solid fa-calendar-day text-orange-500 mr-1"></i>Publicado: ${escHtml(item.fecha)}</p>
        ${item.evento ? `<p><i class="fa-solid fa-calendar text-orange-500 mr-1"></i>${escHtml(item.evento)}</p>` : ''}
      </div>
      ${media}
      <p class="text-xs text-slate-600 leading-relaxed">${escHtml(item.body)}</p>
    </div>
    <div class="p-4 border-t border-slate-100">
      <button data-close="closeAnnStory" class="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm rounded-xl touch-btn">Cerrar</button>
    </div>`;

  content.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => {
    const fn = window[b.dataset.close];
    if (typeof fn === 'function') fn();
  }));

  modal.classList.remove('hidden');
  renderMiManzana();
}

function handleCategorySelect(catId) {
  state.currentCategory = catId;
  UI.renderCategories(state.categories, state.currentCategory, handleCategorySelect);

  const catObj = state.categories.find(c => c.id === catId);
  const listTitle = document.getElementById('listTitle');
  const listSubtitle = document.getElementById('listSubtitle');

  if (listTitle && catObj) {
    listTitle.innerText = catId === 'all' ? '⭐ Vitrinas en Los Naranjos' : `Categoría: ${catObj.name}`;
  }
  if (listSubtitle && catObj) {
    listSubtitle.innerText = catId === 'all' 
      ? 'Mostrando todas las vitrinas activas y verificadas' 
      : `Vitrinas de ${catObj.name.toLowerCase()} en tu conjunto`;
  }

  fetchFilteredBusinesses();
}

// ==========================================
// MODAL DE PERFIL / VITRINA
// ==========================================
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ---- Widget de valoración dentro del perfil ----
let ratingBizId = null;
let ratingStarsValue = 0;

function renderRatingWidget(biz) {
  ratingBizId = biz.id;
  ratingStarsValue = 0;
  const count = biz.ratingCount || biz.reviewsCount || 0;
  const avg = parseFloat(biz.rating) || 0;

  const summary = $('modalRatingsSummary');
  if (summary) {
    summary.innerHTML = `
      <div class="flex items-center gap-3">
        <span class="text-3xl font-extrabold text-amber-500">${avg > 0 ? avg.toFixed(1) : '—'}</span>
        <div class="text-xs leading-tight">
          <div class="flex text-amber-400">
            ${Array(5).fill(0).map((_, i) => `<i class="fa-solid fa-star ${i < Math.round(avg) ? '' : 'text-slate-200'}"></i>`).join('')}
          </div>
          <span class="text-slate-500 mt-0.5 block">${count} valoracion${count === 1 ? '' : 'es'}</span>
        </div>
      </div>`;
  }

  // Reset estrellas interactivas
  document.querySelectorAll('#ratingStarsInput .rating-star').forEach(btn => {
    btn.classList.remove('text-amber-400');
    btn.classList.add('text-slate-300');
  });
  if ($('ratingStarsLabel')) $('ratingStarsLabel').textContent = '0/5';
  if ($('ratingComment')) $('ratingComment').value = '';
  if ($('ratingAuthor')) $('ratingAuthor').value = '';
  const msg = $('ratingFormMsg'); if (msg) { msg.textContent = ''; msg.classList.add('hidden'); }

  // Formulario start hidden, toggle con botón
  const form = $('modalRatingForm');
  const list = $('modalRatingsList');
  const toggleBtn = $('modalRatingsToggle');
  if (form) form.classList.add('hidden');
  if (list) list.classList.add('hidden');
  if (toggleBtn) toggleBtn.textContent = 'Publicar valoración';

  if (toggleBtn) toggleBtn.onclick = () => {
    const vis = form.classList.toggle('hidden');
    if (list) list.classList.toggle('hidden', true);
    toggleBtn.textContent = !vis ? 'Publicar valoración' : 'Ocultar';
  };

  // Últimas 5 valoraciones (mostar junto al formulario aunque esté oculto: se muestran con resumen)
  if (list) {
    const recent = (biz.ratings || []).slice().reverse().slice(0, 5);
    if (recent.length) {
      list.innerHTML = recent.map(r => `
        <div class="bg-white rounded-xl p-2.5 border border-slate-100">
          <div class="flex items-center justify-between">
            <span class="text-amber-400 text-xs">${Array(r.stars).fill('★').join('')}</span>
            <span class="text-[9px] text-slate-400">${new Date(r.createdAt).toLocaleDateString('es-CO')}</span>
          </div>
          ${r.comment ? `<p class="text-[11px] text-slate-600 mt-1 leading-snug">${escHtml(r.comment)}</p>` : ''}
          <span class="text-[9px] text-slate-400 font-bold">— ${escHtml(r.author)}</span>
        </div>`).join('');
    } else {
      list.innerHTML = '<p class="text-[11px] text-slate-400 bg-slate-50 p-2 rounded-xl text-center">Aún no hay valoraciones para esta vitrina.</p>';
    }
  }

  // Estrellas interactivas
  const starsContainer = $('ratingStarsInput');
  if (starsContainer) {
    starsContainer.onclick = e => {
      const btn = e.target.closest('.rating-star');
      if (!btn) return;
      ratingStarsValue = Number(btn.dataset.star);
      $('ratingStarsLabel').textContent = `${ratingStarsValue}/5`;
      starsContainer.querySelectorAll('.rating-star').forEach(b => {
        const v = Number(b.dataset.star);
        b.classList.toggle('text-amber-400', v <= ratingStarsValue);
        b.classList.toggle('text-slate-300', v > ratingStarsValue);
      });
    };
  }

  // Enviar valoración
  const sendBtn = $('ratingSubmitBtn');
  if (sendBtn) sendBtn.onclick = async () => {
    if (!ratingStarsValue) { alert('Selecciona entre 1 y 5 estrellas.'); return; }
    const formMsg = $('ratingFormMsg');
    const r = await API.rateBusiness(ratingBizId, {
      stars: ratingStarsValue,
      author: $('ratingAuthor') ? $('ratingAuthor').value.trim() : '',
      comment: $('ratingComment') ? $('ratingComment').value.trim() : ''
    });
    if (r.success) {
      formMsg.textContent = r.message;
      formMsg.classList.remove('hidden');
      formMsg.className = 'text-[11px] font-bold p-2 rounded-xl border text-emerald-600 bg-emerald-50 border-emerald-100';
      const fresh = await API.getBusinessById(ratingBizId);
      if (fresh) {
        state.selectedBusiness = fresh;
        const idx = state.businesses.findIndex(b => b.id === fresh.id);
        if (idx > -1) state.businesses[idx] = fresh;
        renderBusinessList();
        renderRatingWidget(fresh);
        // re-show form summary
        if ($('modalRatingForm')) $('modalRatingForm').classList.add('hidden');
        if ($('modalRatingsToggle')) $('modalRatingsToggle').textContent = 'Publicar valoración';
      }
    } else {
      formMsg.textContent = r.message || 'Error al guardar.';
      formMsg.classList.remove('hidden');
      formMsg.className = 'text-[11px] font-bold p-2 rounded-xl border text-red-600 bg-red-50 border-red-100';
    }
  };
}

async function handleOpenProfile(bizId) {
  const biz = await API.getBusinessById(bizId);
  if (!biz) return;
  state.selectedBusiness = biz;

  document.getElementById('modalCoverImg').src = biz.coverImage;
  document.getElementById('modalCategoryBadge').innerText = biz.category.toUpperCase();
  document.getElementById('modalBizName').innerText = biz.name;
  document.getElementById('modalBizLocation').innerText = `📍 Manzana ${biz.manzana} (Los Naranjos)`;
  document.getElementById('modalBizRating').innerHTML = `★ ${biz.rating} · ${biz.ratingCount || biz.reviewsCount || 0} recomendaciones`;
  document.getElementById('modalBizDesc').innerText = biz.fullDesc;
  document.getElementById('modalBizHours').innerText = biz.hours;
  document.getElementById('modalBizDelivery').innerText = biz.delivery;

  // Redes sociales (Instagram / Facebook) — solo si existen
  const socialsEl = document.getElementById('modalBizSocials');
  const socialLinks = [];
  if (biz.instagram) {
    socialLinks.push(`<a href="${socialUrl(biz.instagram)}" target="_blank" rel="noopener" class="flex items-center space-x-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold px-3 py-2.5 rounded-xl shadow touch-btn">
      <i class="fa-brands fa-instagram text-base"></i><span>${biz.instagram}</span></a>`);
  }
  if (biz.facebook) {
    socialLinks.push(`<a href="${socialUrl(biz.facebook)}" target="_blank" rel="noopener" class="flex items-center space-x-2.5 bg-[#1877F2] text-white text-xs font-bold px-3 py-2.5 rounded-xl shadow touch-btn">
      <i class="fa-brands fa-facebook-f text-base"></i><span>Ver Facebook</span></a>`);
  }
  if (socialLinks.length > 0) {
    socialsEl.innerHTML = socialLinks.join('');
    socialsEl.classList.remove('hidden');
  } else {
    socialsEl.classList.add('hidden');
  }

  const productsContainer = document.getElementById('modalProductsList');

  const prods = (biz.products || []).map(p => ({
    name: String(p.name || ''),
    description: String(p.description || ''),
    photo: String(p.photo || p.image || ''),
    price: String(p.price || ''),
    category: String(p.category || 'General'),
    availability: p.availability === 'agotado' ? 'agotado' : 'activo'
  }));

  let productsHtml = '';
  if (prods.length === 0) {
    productsHtml = '<p class="text-xs text-slate-400 text-center py-4">Esta vitrina aún no tiene productos publicados.</p>';
  } else {
    const grupos = {};
    prods.forEach(p => { (grupos[p.category] = grupos[p.category] || []).push(p); });
    Object.keys(grupos).forEach(cat => {
      productsHtml += `
        <div class="mt-2">
          <p class="text-[10px] font-extrabold uppercase tracking-wide text-slate-400 px-1 mb-1">${escHtml(cat)}</p>
          <div class="space-y-2">`;
      grupos[cat].forEach((prod, i) => {
        const agotado = prod.availability === 'agotado';
        productsHtml += `
          <div class="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 border border-slate-100">
            <div class="flex items-center space-x-2.5 min-w-0">
              <img src="${prod.photo}" alt="${escHtml(prod.name)}" class="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-slate-200"/>
              <div class="min-w-0">
                <h5 class="text-xs font-bold text-slate-800 leading-tight">${escHtml(prod.name)}</h5>
                ${prod.price ? `<span class="text-xs font-extrabold text-emerald-600">${escHtml(prod.price)}</span>` : ''}
                ${agotado ? '<span class="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Agotado</span>' : ''}
                ${prod.description ? `<p class="text-[10px] text-slate-500 truncate">${escHtml(prod.description)}</p>` : ''}
              </div>
            </div>
            <div class="flex flex-col gap-1 flex-shrink-0">
              <button data-prodwa="${i}" data-cat="${escHtml(cat)}" class="prod-wa-btn px-2.5 py-1 bg-[#25D366] hover:bg-[#1ebd59] text-white text-[10px] font-bold rounded-lg flex items-center space-x-1 shadow">
                <i class="fa-brands fa-whatsapp"></i><span>${agotado ? 'Contactar' : 'Pedir'}</span>
              </button>
            </div>
          </div>`;
      });
      productsHtml += `</div></div>`;
    });
  }
  productsContainer.innerHTML = productsHtml;
  productsContainer.querySelectorAll('img').forEach(img => {
    img.addEventListener('error', () => { img.style.display = 'none'; });
  });
  renderRatingWidget(biz);

  productsContainer.querySelectorAll('[data-prodwa]').forEach(btn => {
    btn.addEventListener('click', () => {
      const prod = prods[Number(btn.dataset.prodwa)];
      document.getElementById('profileModal').classList.add('hidden');
      const msg = WhatsAppHelper.buildProductMessage(biz, { name: prod.name });
      openWhatsAppPreview(biz.name, biz.phone, msg);
    });
  });

  const mainWhatsAppBtn = document.getElementById('modalMainWhatsAppBtn');
  mainWhatsAppBtn.onclick = () => {
    const msg = WhatsAppHelper.buildGeneralMessage(biz);
    openWhatsAppPreview(biz.name, biz.phone, msg);
  };

  document.getElementById('profileModal').classList.remove('hidden');
}

// Modal Oferta
function handleOpenOffer(offerId) {
  const offer = state.offers.find(o => o.id === offerId);
  if (!offer) return;
  state.selectedOffer = offer;

  document.getElementById('offerModalImg').src = offer.image;
  document.getElementById('offerModalBizName').innerText = offer.bizName;
  document.getElementById('offerModalTitle').innerText = offer.title;
  document.getElementById('offerModalPrice').innerText = offer.price;
  document.getElementById('offerModalOldPrice').innerText = offer.oldPrice;
  document.getElementById('offerModalDesc').innerText = offer.desc;

  document.getElementById('offerModalWhatsAppBtn').onclick = () => {
    document.getElementById('offerModal').classList.add('hidden');
    const msg = WhatsAppHelper.buildOfferMessage(offer);
    openWhatsAppForOffer(offer, msg);
  };

  document.getElementById('offerModal').classList.remove('hidden');
}

// Botón "Contactar" directo en la tarjeta del carrusel
async function handleContactOffer(offerId) {
  const offer = state.offers.find(o => o.id === offerId);
  if (!offer) return;
  const msg = WhatsAppHelper.buildOfferMessage(offer);
  openWhatsAppForOffer(offer, msg);
}

// Resuelve el teléfono real del negocio de la oferta (antes estaba hardcodeado)
function openWhatsAppForOffer(offer, msg) {
  const biz = state.businesses.find(b => b.id === offer.bizId);
  const phone = (biz && biz.phone) || offer.phone || offer.bizPhone || '';
  if (!phone) {
    alert('Este emprendimiento aún no tiene un teléfono de contacto publicado.');
    return;
  }
  openWhatsAppPreview(offer.bizName, phone, msg);
}

async function handleQuickWhatsApp(bizId) {
  const biz = await API.getBusinessById(bizId);
  if (!biz) return;
  const msg = WhatsAppHelper.buildGeneralMessage(biz);
  openWhatsAppPreview(biz.name, biz.phone, msg);
}

function openWhatsAppPreview(bizName, phone, messageText) {
  const waUrl = WhatsAppHelper.createUrl(phone, messageText);
  document.getElementById('waPreviewTitle').innerText = `Mensaje para: ${bizName}`;
  document.getElementById('waPreviewMessage').innerText = messageText;
  document.getElementById('waDirectLink').href = waUrl;
  document.getElementById('waPreviewModal').classList.remove('hidden');
}

// Normaliza un valor de red social a una URL navegable
function socialUrl(value) {
  if (!value) return '#';
  const v = String(value).trim();
  if (/@/.test(v)) {
    const handle = v.replace(/^@/, '');
    if (/facebook/i.test(handle)) return `https://www.facebook.com/${handle.replace(/facebook/i, '')}`;
    return `https://www.instagram.com/${handle}`;
  }
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
}

// ==========================================
// ASISTENTE DE REGISTRO, PAGO Y ACTIVACIÓN
// ==========================================
function resetRegisterWizard() {
  state.newBizData = null;
  state.createdBiz = null;
  state.currentReceipt = null;

  document.getElementById('regName').value = '';
  document.getElementById('regPhone').value = '';
  document.getElementById('regShortDesc').value = '';
  document.getElementById('regHours').value = '';
  resetImageUpload('regCoverImg');

  document.getElementById('prod1Name').value = '';
  document.getElementById('prod1Price').value = '';
  resetImageUpload('prod1Img');

  document.getElementById('prod2Name').value = '';
  document.getElementById('prod2Price').value = '';
  resetImageUpload('prod2Img');

  const regTerms = document.getElementById('regTerms');
  if (regTerms) regTerms.checked = false;

  showWizardStep(1);
}

function showWizardStep(stepNumber) {
  for (let i = 1; i <= 4; i++) {
    const stepEl = document.getElementById(`wizardStep${i}`);
    if (stepEl) {
      stepEl.classList.toggle('hidden', i !== stepNumber);
    }
  }
}

// Paso 1: Validar datos principales
function handleStep1Next() {
  const name = document.getElementById('regName').value.trim();
  const manzana = document.getElementById('regMz').value;
  const category = document.getElementById('regCat').value;
  const phone = document.getElementById('regPhone').value.trim();
  const shortDesc = document.getElementById('regShortDesc').value.trim();
  const hours = document.getElementById('regHours').value.trim();
  const coverImage = document.getElementById('regCoverImg_url').value.trim();
  const instagram = document.getElementById('regInstagram').value.trim();
  const facebook = document.getElementById('regFacebook').value.trim();

  if (!name || !phone) {
    alert('Por favor ingresa el nombre de tu emprendimiento y tu número de WhatsApp.');
    return;
  }

  state.newBizData = {
    name,
    manzana,
    category,
    phone,
    shortDesc: shortDesc || `Emprendimiento de la Manzana ${manzana} en Los Naranjos.`,
    hours: hours || 'Lunes a Sábado: 8:00 AM - 7:00 PM',
    coverImage: coverImage || 'https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=800&q=80',
    delivery: 'Domicilio / Entrega en Los Naranjos',
    instagram: instagram || null,
    facebook: facebook || null
  };

  showWizardStep(2);
}

// Paso 2: Crear la vitrina y pasar al Pago
async function handleStep2Submit() {
  const regTerms = document.getElementById('regTerms');
  if (regTerms && !regTerms.checked) {
    alert('Debes aceptar los Términos y Condiciones para activar tu vitrina.');
    return;
  }

  const products = [];

  const p1Name = document.getElementById('prod1Name').value.trim();
  const p1Price = document.getElementById('prod1Price').value.trim();
  const p1Img = document.getElementById('prod1Img_url').value.trim();

  if (p1Name) {
    products.push({
      name: p1Name,
      price: p1Price || '$20.000',
      image: p1Img || state.newBizData.coverImage
    });
  }

  const p2Name = document.getElementById('prod2Name').value.trim();
  const p2Price = document.getElementById('prod2Price').value.trim();
  const p2Img = document.getElementById('prod2Img_url').value.trim();

  if (p2Name) {
    products.push({
      name: p2Name,
      price: p2Price || '$25.000',
      image: p2Img || state.newBizData.coverImage
    });
  }

  state.newBizData.products = products;

  // Registrar en backend
  const res = await API.registerBusiness(state.newBizData);
  if (!res.success) {
    alert('Error al registrar la vitrina: ' + (res.message || 'Intenta de nuevo.'));
    return;
  }

  state.createdBiz = res.data;

  // Actualizar resumen en Paso 3 (Pantalla de Pago)
  document.getElementById('checkoutBizName').innerText = state.createdBiz.name;
  document.getElementById('checkoutBizManzana').innerText = `Manzana ${state.createdBiz.manzana}`;
  
  showWizardStep(3);
}

// Paso 3: Procesar Pago y Activar por 30 Días
// Se prepara una transacción en el backend. Si Wompi está configurado
// (widgetActive), se abre el Widget. Si no, se usa el flujo simulado.
async function handleProcessPayment() {
  const payerName = (document.getElementById('wompiPayerName')?.value || state.createdBiz.name).trim();
  const payerPhone = (document.getElementById('wompiPayerPhone')?.value || state.createdBiz.phone).trim();
  const payerEmail = (document.getElementById('wompiPayerEmail')?.value || '').trim();

  const paymentBtn = document.getElementById('processPaymentBtn');
  paymentBtn.disabled = true;
  paymentBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Preparando pago seguro...`;

  // 1) Preparar transacción (backend decide modo wompi vs simulado)
  const payload = {
    businessId: state.createdBiz.id,
    payerName,
    payerPhone,
    payerEmail
  };

  let res;
  try {
    res = await API.wompiCheckout(payload);
  } catch (e) {
    res = null;
  }

  paymentBtn.disabled = false;
  paymentBtn.innerHTML = `<i class="fa-solid fa-lock"></i> <span>Pagar $31.600 con Wompi</span>`;

  if (!res || !res.success || !res.data) {
    alert('No se pudo preparar el pago: ' + ((res && res.message) || 'Error de conexión.'));
    return;
  }

  const checkout = res.data;

  // MODO Wompi real: abrir el Widget Checkout
  if (checkout.widgetActive) {
    state.currentPayment = {
      transactionId: checkout.transactionId,
      reference: checkout.reference
    };

    try {
      await openWompiCheckout(checkout, (result) => {
        if (result && result.error) {
          showPaymentResult('error', 'Error en el pago', result.error);
          return;
        }
        if (result && result.canceled) {
          showPaymentResult('pending', 'Pago no completado', 'Cerraste el formulario de pago. Puedes volver a intentar cuando quieras.');
          return;
        }
        if (result && result.transaction) {
          // El widget devolvió una transacción: consultamos el estado real
          const trxId = checkout.transactionId;
          const wompiTxId = result.transaction.id;
          showPaymentResult('pending', 'Procesando transacción...', 'Estamos verificando el estado de tu pago con Wompi.');
          pollTransactionStatus(trxId, wompiTxId);
        }
      });
    } catch (err) {
      console.error('Error con el widget Wompi:', err);
      showPaymentResult('error', 'No se pudo abrir el pago', err.message || 'Intenta de nuevo.');
    }
    return;
  }

  // MODO simulado (dev / sin llaves): activación inmediata
  res = await API.processPayment(payload);
  if (!res.success) {
    alert('No se pudo procesar el pago: ' + (res.message || 'Error'));
    return;
  }
  finishPaymentSuccess(res.receipt);
}

// Activa la vitrina y muestra la pantalla de éxito tras un pago aprobado
function finishPaymentSuccess(receipt) {
  state.currentReceipt = receipt;

  UI.renderDigitalReceipt(state.currentReceipt, 'receiptDetailContainer');

  document.getElementById('viewLiveStoreBtn').onclick = () => {
    closeRegisterWizard();
    handleOpenProfile(state.createdBiz.id);
  };

  const downloadReceiptBtn = document.getElementById('downloadReceiptBtn');
  if (downloadReceiptBtn) {
    downloadReceiptBtn.onclick = () => {
      window.open(`/recibo.html?id=${state.currentReceipt.receiptId}`, '_blank');
    };
  }

  document.getElementById('shareReceiptWaBtn').onclick = () => {
    const shareMsg = WhatsAppHelper.buildReceiptShareMessage(state.currentReceipt);
    const waUrl = WhatsAppHelper.createUrl(state.createdBiz.phone, shareMsg);
    window.open(waUrl, '_blank');
  };

  // Recargar el directorio para mostrar la nueva vitrina activa
  loadInitialData();

  showWizardStep(4);
}

// Consulta el estado de la transacción hasta confirmar APPROVED / DECLINED / etc.
function pollTransactionStatus(localTxId, wompiTxId) {
  if (state.paymentPollTimer) clearInterval(state.paymentPollTimer);
  let attempts = 0;
  const maxAttempts = 40; // ~20 segundos

  state.paymentPollTimer = setInterval(async () => {
    attempts += 1;
    const tx = await API.getPaymentTransaction(localTxId);

    if (!tx || attempts >= maxAttempts) {
      clearInterval(state.paymentPollTimer);
      state.paymentPollTimer = null;
      if (!tx) {
        showPaymentResult('pending', 'Verificando pago...', 'Aún no recibimos la confirmación. Te notificaremos por WhatsApp cuando esté aprobado.');
      } else {
        handleTransactionStatus(tx);
      }
      return;
    }

    if (tx.wompiTransactionId && tx.wompiTransactionId !== wompiTxId) {
      // Aún no llega el id de Wompi; esperamos
    }

    handleTransactionStatus(tx);
  }, 500);
}

// Según el estado de la transacción local, decide qué mostrar.
function handleTransactionStatus(tx) {
  const status = (tx.status || '').toUpperCase();
  if (status === 'APPROVED') {
    clearInterval(state.paymentPollTimer);
    state.paymentPollTimer = null;
    // El webhook ya activó la vitrina y generó el recibo.
    // Buscamos el recibo reciente del negocio.
    loadReceiptForSuccess();
    return;
  }
  if (['DECLINED', 'VOIDED', 'ERROR'].includes(status)) {
    clearInterval(state.paymentPollTimer);
    state.paymentPollTimer = null;
    showPaymentResult('error', 'Pago no completado', mapPaymentStatusMsg(status));
    return;
  }
  // PENDING: seguimos esperando (el interval continúa)
}

function mapPaymentStatusMsg(status) {
  switch (status) {
    case 'DECLINED': return 'Tu banco o medio de pago rechazó la transacción. Verifica los datos e intenta de nuevo.';
    case 'VOIDED': return 'La transacción fue anulada. Puedes intentar el pago nuevamente.';
    case 'ERROR': return 'Ocurrió un error con la transacción. Intenta de nuevo.';
    default: return 'La transacción no se pudo completar.';
  }
}

function loadReceiptForSuccess() {
  API.getReceiptByBusiness?.(state.createdBiz.id).then(r => {
    if (r) finishPaymentSuccess(r);
    else showPaymentResult('success', '¡Pago aprobado!', 'Tu vitrina está activa. Recibo enviado a tu WhatsApp.');
  }).catch(() => {
    showPaymentResult('success', '¡Pago aprobado!', 'Tu vitrina está activa. Recibo enviado a tu WhatsApp.');
  });
}

// Muestra el modal de resultado de pago
function showPaymentResult(type, title, message) {
  clearInterval(state.paymentPollTimer);
  state.paymentPollTimer = null;

  const modal = document.getElementById('paymentResultModal');
  const icon = document.getElementById('paymentResultIcon');
  const titleEl = document.getElementById('paymentResultTitle');
  const msg = document.getElementById('paymentResultMsg');
  const btn = document.getElementById('paymentResultBtn');

  if (type === 'success') {
    icon.className = 'w-16 h-16 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl';
    icon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
    btn.textContent = 'Ver mi vitrina';
  } else if (type === 'error') {
    icon.className = 'w-16 h-16 mx-auto rounded-full bg-red-100 text-red-600 flex items-center justify-center text-2xl';
    icon.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
    btn.textContent = 'Cerrar';
  } else {
    icon.className = 'w-16 h-16 mx-auto rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-2xl';
    icon.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i>';
    btn.textContent = 'Cerrar';
  }

  titleEl.textContent = title;
  msg.textContent = message;

  modal.classList.remove('hidden');
}

// ==========================================
// CONSULTAR Y GESTIONAR VIGENCIA DE VITRINA
// ==========================================
async function handleSearchManagePhone() {
  const phone = document.getElementById('managePhoneInput').value.trim();
  if (!phone) {
    alert('Ingresa tu número de WhatsApp registrado.');
    return;
  }

  const res = await API.getBusinessByPhone(phone);
  const resultSection = document.getElementById('manageResultSection');

  if (!res.success || !res.data) {
    alert('No encontramos ninguna vitrina con este número. Verifica que esté bien escrito.');
    resultSection.classList.add('hidden');
    return;
  }

  const biz = res.data;
  state.managingBiz = biz;

  document.getElementById('manageBizName').innerText = biz.name;
  document.getElementById('manageBizMz').innerText = `Manzana ${biz.manzana}`;
  
  const statusBadge = document.getElementById('manageStatusBadge');
  const daysText = document.getElementById('manageDaysRemaining');
  const renewBtn = document.getElementById('renewManageBtn');

  if (biz.status === 'active') {
    statusBadge.className = 'px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800';
    statusBadge.innerText = '● Activa';
    daysText.innerText = `Te quedan ${biz.daysRemaining || 30} días de vigencia activa.`;
    renewBtn.innerText = 'Extender 30 días más ($31.600 COP)';
  } else {
    statusBadge.className = 'px-2.5 py-1 rounded-full text-xs font-extrabold bg-red-100 text-red-800';
    statusBadge.innerText = '● Pausada por Vencimiento';
    daysText.innerText = 'Los 30 días calendario han expirado. Paga para reactivarla de inmediato.';
    renewBtn.innerText = 'Reactivar mi Vitrina ($31.600 COP)';
  }

  resultSection.classList.remove('hidden');
}

// Renovar desde el panel de gestión
async function handleRenewFromManage() {
  if (!state.managingBiz) return;

  state.createdBiz = state.managingBiz;
  document.getElementById('manageModal').classList.add('hidden');

  // Abrir checkout
  document.getElementById('checkoutBizName').innerText = state.createdBiz.name;
  document.getElementById('checkoutBizManzana').innerText = `Manzana ${state.createdBiz.manzana}`;
  
  document.getElementById('registerWizardModal').classList.remove('hidden');
  showWizardStep(3);
}

// Cierre de modales
function closeRegisterWizard() {
  document.getElementById('registerWizardModal').classList.add('hidden');
}

window.closeProfileModal = () => document.getElementById('profileModal').classList.add('hidden');
window.closeOfferModal = () => document.getElementById('offerModal').classList.add('hidden');
window.closeWaPreview = () => document.getElementById('waPreviewModal').classList.add('hidden');
window.closeRegisterWizard = closeRegisterWizard;
window.closeManageModal = () => document.getElementById('manageModal').classList.add('hidden');

// ============================================================
// CHECKOUT DUAL: Identidad (Registrado / Invitado) + Pedido
// ============================================================

// Carga la lista de torres en los selects indicados (10 torres por manzana, 9 pisos, 4 aptos)
async function ensureTowers(selectIds, ops = {}) {
  if (!state.towersList || state.towersList.length === 0) {
    const cfg = await API.getTowers();
    state.towersList = (cfg && cfg.towers) ? cfg.towers : [];
  }
  selectIds.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const current = sel.value;
    let list = state.towersList;
    if (ops.manzana) {
      const filtered = list.filter(t => String(t.manzana) === String(ops.manzana).trim());
      if (filtered.length > 0) list = filtered;
    } else if (ops.onlyFromManzana) {
      list = [];
    }
    const place = ops.placeholder ? `<option value="">${ops.placeholder}</option>` : '';
    sel.innerHTML = place + list.map(t => {
      const value = ops.useId ? t.id : t.name;
      const label = ops.useId ? `${t.name} · Manzana ${t.manzana}` : t.name;
      return `<option value="${value}">${label}</option>`;
    }).join('');
    if (current && [...sel.options].some(o => o.value === current)) sel.value = current;
  });
}

// Resuelve el valor del select (id de torre) a partir del nombre guardado en el perfil
function towerOptionValue(towerName) {
  const t = state.towersList.find(x => x.name === towerName);
  return t ? t.id : towerName;
}

// Abre el modal de checkout dual para un pedido concreto
async function openCheckoutFor(business, products) {
  state.checkoutCtx = { business, products, mode: 'login', resident: null };

  // Resumen del pedido
  const totalQty = products.reduce((a, p) => a + (p.qty || 1), 0);
  document.getElementById('checkoutOrderCount').innerText = `${products.length} producto${products.length === 1 ? '' : 's'}`;
  document.getElementById('checkoutOrderText').innerText =
    `${business.name} · ${products.map(p => `${p.name}${p.qty > 1 ? ` ×${p.qty}` : ''}`).join(', ')}`;

  // Precargar torres (todas las manzanas: "Torre N · Manzana M")
  await ensureTowers(['coGuestTower'], { useId: true });
  document.getElementById('coGuestTower').insertAdjacentHTML('afterbegin', '<option value="">Selecciona tu torre</option>');

  // Autocompletar si el residente ya se identificó antes (perfil guardado)
  const existing = API.getStoredResidentProfile();
  if (existing) {
    document.getElementById('coGuestName').value = existing.fullName || '';
    document.getElementById('coGuestPhone').value = (existing.phone || '').replace('57', '');
    if (existing.tower) {
      const sel = document.getElementById('coGuestTower');
      const val = towerOptionValue(existing.tower);
      if ([...sel.options].some(o => o.value === val)) sel.value = val;
    }
    document.getElementById('coGuestApt').value = existing.apartment || '';
    document.getElementById('coGuestBirth').value = existing.birthDate || '';
    document.getElementById('coGuestDelivery').value = existing.deliveryAddress || '';
  }

  resetCheckoutPanels();
  switchCheckoutMode('login');
  document.getElementById('checkoutError').classList.add('hidden');
  document.getElementById('checkoutModal').classList.remove('hidden');
}

function resetCheckoutPanels() {
  document.getElementById('coLoginPhone').value = API.getStoredResidentProfile()?.phone?.replace('57', '') || '';
  document.getElementById('coLoginPassword').value = '';
  document.getElementById('coGuestName').value = API.getStoredResidentProfile()?.fullName || '';
  document.getElementById('coGuestPhone').value = API.getStoredResidentProfile()?.phone?.replace('57', '') || '';
  document.getElementById('coGuestDelivery').value = '';
  const guestTerms = document.getElementById('coGuestTerms');
  if (guestTerms) guestTerms.checked = false;
}

function switchCheckoutMode(mode) {
  state.checkoutCtx.mode = mode;
  const loginTab = document.getElementById('checkoutTabLogin');
  const guestTab = document.getElementById('checkoutTabGuest');
  const loginPanel = document.getElementById('checkoutLoginPanel');
  const guestPanel = document.getElementById('checkoutGuestPanel');

  const active = 'bg-slate-900 text-white border-slate-900';
  const inactive = 'bg-white text-slate-600 border-slate-200';

  if (mode === 'login') {
    loginTab.className = `py-2.5 rounded-xl text-xs font-extrabold border touch-btn transition ${active}`;
    guestTab.className = `py-2.5 rounded-xl text-xs font-extrabold border touch-btn transition ${inactive}`;
    loginPanel.classList.remove('hidden');
    guestPanel.classList.add('hidden');
  } else {
    loginTab.className = `py-2.5 rounded-xl text-xs font-extrabold border touch-btn transition ${inactive}`;
    guestTab.className = `py-2.5 rounded-xl text-xs font-extrabold border touch-btn transition ${active}`;
    loginPanel.classList.add('hidden');
    guestPanel.classList.remove('hidden');
  }
}

window.closeCheckoutModal = () => {
  document.getElementById('checkoutModal').classList.add('hidden');
  state.checkoutCtx = null;
};

// Modal Términos, Condiciones y Confidencialidad
function openTermsModal() {
  document.getElementById('termsModal').classList.remove('hidden');
}
window.closeTermsModal = () => document.getElementById('termsModal').classList.add('hidden');

// Modal ingreso por QR / enlace.
// 1er paso: celular → buscamos si la persona ya ingresó (reconocimiento).
// 2do paso: confirmación si la reconocemos, o formulario completo si es nueva.
let entrySelectedRole = 'buyer';
let entryPhase = 'phone';      // 'phone' | 'known' | 'new'
let entryKnown = null;         // residente reconocido por celular (o null)

function setEntryPhase(phase) {
  entryPhase = phase;
  const phonePanel = document.getElementById('entryPhonePanel');
  const detailsPanel = document.getElementById('entryDetailsPanel');
  const recBox = document.getElementById('entryRecognitionBox');
  const newForm = document.getElementById('entryNewForm');
  const btn = document.getElementById('entrySubmitBtn');
  document.getElementById('entryError').classList.add('hidden');

  if (phase === 'phone') {
    phonePanel.classList.remove('hidden');
    detailsPanel.classList.add('hidden');
    btn.innerHTML = '<i class="fa-solid fa-arrow-right"></i><span>Continuar</span>';
    return;
  }
  phonePanel.classList.add('hidden');
  detailsPanel.classList.remove('hidden');
  if (phase === 'known') {
    recBox.classList.remove('hidden');
    newForm.classList.add('hidden');
    btn.innerHTML = '<i class="fa-solid fa-check"></i><span>Confirmar mi ingreso</span>';
  } else {
    recBox.classList.add('hidden');
    newForm.classList.remove('hidden');
    btn.innerHTML = '<i class="fa-solid fa-arrow-right"></i><span>Registrar mi ingreso</span>';
  }
}

function openEntryModal() {
  const prof = API.getStoredResidentProfile();
  document.getElementById('entryPhone').value = (prof && prof.phone) ? prof.phone.replace('57', '') : '';
  document.getElementById('entryApt').value = '';
  document.getElementById('entryMz').value = '';
  document.getElementById('entryTower').innerHTML = '<option value="" selected>Selecciona tu torre</option>';
  document.getElementById('entryTerms').checked = false;
  entrySelectedRole = 'buyer';
  updateEntryRoleUI();
  entryKnown = null;
  setEntryPhase('phone');
  document.getElementById('entryModal').classList.remove('hidden');
}

window.closeEntryModal = () => document.getElementById('entryModal').classList.add('hidden');

function updateEntryRoleUI() {
  const active = 'border-orange-500 bg-orange-50 text-orange-700';
  const inactive = 'border-slate-200 bg-white text-slate-600';
  document.querySelectorAll('.entry-role-btn').forEach(b => {
    b.className = `entry-role-btn py-3 rounded-xl border font-extrabold text-xs touch-btn flex items-center justify-center space-x-1.5 transition ${b.dataset.role === entrySelectedRole ? active : inactive}`;
  });
}

// Paso 1: con el celular decidimos si reconocemos a la persona o pedimos el formulario.
async function handleEntryLookup() {
  const errEl = document.getElementById('entryError');
  errEl.classList.add('hidden');

  const phone = document.getElementById('entryPhone').value.trim();
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) {
    errEl.textContent = 'Ingresa un número de celular válido (10 dígitos).';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('entrySubmitBtn');
  btn.disabled = true;
  btn.innerHTML = '<span>Buscando...</span>';

  const r = await API.residentLookup(digits);
  if (r.success && r.found && r.data) {
    entryKnown = r.data;
    entrySelectedRole = (r.data.role === 'seller') ? 'seller' : 'buyer';
    updateEntryRoleUI();
    if (r.data.manzana) document.getElementById('entryMz').value = String(r.data.manzana);
    if (r.data.apartment) document.getElementById('entryApt').value = r.data.apartment;
    const mz = r.data.manzana ? String(r.data.manzana) : '';
    if (r.data.tower) {
      ensureTowers(['entryTower'], { manzana: mz, placeholder: '', onlyFromManzana: true });
      const sel = document.getElementById('entryTower');
      if ([...sel.options].some(o => o.value === r.data.tower)) sel.value = r.data.tower;
    }
    const rol = r.data.role === 'seller' ? 'Emprendedor' : 'Comprador';
    document.getElementById('entryRecognitionData').textContent =
      `Manzana ${r.data.manzana || '—'} · ${r.data.tower || '—'} · Apto ${r.data.apartment || '—'} · ${rol}`;
    document.getElementById('entryTerms').checked = false;
    setEntryPhase('known');
  } else {
    entryKnown = null;
    document.getElementById('entryApt').value = '';
    document.getElementById('entryMz').value = '';
    document.getElementById('entryTower').innerHTML = '<option value="" selected>Selecciona tu torre</option>';
    document.getElementById('entryTerms').checked = false;
    entrySelectedRole = 'buyer';
    updateEntryRoleUI();
    setEntryPhase('new');
  }
  btn.disabled = false;
  btn.innerHTML = entryPhase === 'phone' ? '<i class="fa-solid fa-arrow-right"></i><span>Continuar</span>' : '<span>Buscando...</span>';
  if (entryPhase === 'known') btn.innerHTML = '<i class="fa-solid fa-check"></i><span>Confirmar mi ingreso</span>';
  if (entryPhase === 'new') btn.innerHTML = '<i class="fa-solid fa-arrow-right"></i><span>Registrar mi ingreso</span>';
}

// Paso 2: guarda el ingreso (reconocido o con formulario completo).
async function handleEntrySubmit() {
  const errEl = document.getElementById('entryError');
  errEl.classList.add('hidden');

  const phone = document.getElementById('entryPhone').value.trim();
  const acceptedTerms = document.getElementById('entryTerms').checked;

  let role, manzana, tower, apartment;
  if (entryPhase === 'known' && entryKnown) {
    role = entryKnown.role === 'seller' ? 'seller' : 'buyer';
    manzana = entryKnown.manzana;
    tower = entryKnown.tower;
    apartment = entryKnown.apartment;
  } else {
    role = entrySelectedRole;
    manzana = document.getElementById('entryMz').value;
    tower = document.getElementById('entryTower').value;
    apartment = document.getElementById('entryApt').value.trim();
  }

  const digits = phone.replace(/\D/g, '');
  if (!role) {
    errEl.textContent = 'Selecciona si ingresas como Comprador o como Vendedor.';
    errEl.classList.remove('hidden');
    return;
  }
  if (digits.length < 10) {
    errEl.textContent = 'Ingresa un número de celular válido (10 dígitos).';
    errEl.classList.remove('hidden');
    return;
  }
  if (!manzana) {
    errEl.textContent = 'Selecciona tu manzana.';
    errEl.classList.remove('hidden');
    return;
  }
  if (!tower) {
    errEl.textContent = 'Selecciona tu torre.';
    errEl.classList.remove('hidden');
    return;
  }
  if (!apartment) {
    errEl.textContent = 'Ingresa tu apartamento.';
    errEl.classList.remove('hidden');
    return;
  }
  if (!acceptedTerms) {
    errEl.textContent = 'Debes aceptar los Términos y Condiciones para continuar.';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('entrySubmitBtn');
  btn.disabled = true;
  btn.innerHTML = '<span>Guardando...</span>';

  const res = await API.communityEntry({ phone, manzana, tower, apartment, role, acceptedTerms });
  if (!res.success) {
    errEl.textContent = res.message || 'No pudimos guardar tus datos.';
    errEl.classList.remove('hidden');
    btn.disabled = false;
    btn.innerHTML = entryPhase === 'known' ? '<i class="fa-solid fa-check"></i><span>Confirmar mi ingreso</span>' : '<i class="fa-solid fa-arrow-right"></i><span>Registrar mi ingreso</span>';
    return;
  }

  btn.disabled = false;
  document.getElementById('entryModal').classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  mmState.mode = 'resident';
  mmState.manzana = String(manzana || '3');
  renderMiManzana();

  if (role === 'seller') {
    if (entryKnown && entryKnown.hasBusiness) {
      // Emprendedor ya registrado → lo llevamos a gestionar su vitrina
      document.getElementById('managePhoneInput').value = digits;
      document.getElementById('manageResultSection').classList.add('hidden');
      document.getElementById('manageModal').classList.remove('hidden');
    } else {
      resetRegisterWizard();
      if (digits) document.getElementById('regPhone').value = digits;
      document.getElementById('registerWizardModal').classList.remove('hidden');
    }
  }
}

// Se muestra SIEMPRE en el primer ingreso (por enlace o QR), antes de ver la vitrina,
// hasta que la persona elija rol y guarde celular, manzana, torre y apartamento.
function maybeShowEntryModal() {
  if (API.getStoredResidentProfile()) return;
  setTimeout(() => openEntryModal(), 400);
}

// Login de residente dentro del checkout → autocompleta torre/apto
async function handleCheckoutLogin() {
  const phone = document.getElementById('coLoginPhone').value.trim();
  const password = document.getElementById('coLoginPassword').value;
  const errEl = document.getElementById('checkoutError');
  errEl.classList.add('hidden');

  if (!phone || !password) {
    errEl.textContent = 'Ingresa tu teléfono y contraseña.';
    errEl.classList.remove('hidden');
    return;
  }

  const res = await API.residentLogin(phone, password);
  if (!res.success) {
    errEl.textContent = res.message || 'No pudimos iniciar sesión.';
    errEl.classList.remove('hidden');
    return;
  }

  const profile = res.data.resident;
  // Autocompletar apartamento/torre
  if (profile.tower) {
    const sel = document.getElementById('coGuestTower');
    const val = towerOptionValue(profile.tower);
    if ([...sel.options].some(o => o.value === val)) sel.value = val;
  }
  document.getElementById('coGuestApt').value = profile.apartment || '';
  document.getElementById('coGuestName').value = profile.fullName || '';
  document.getElementById('coGuestPhone').value = (profile.phone || '').replace('57', '');
  document.getElementById('coGuestBirth').value = profile.birthDate || '';
  document.getElementById('coGuestDelivery').value = profile.deliveryAddress || '';

  // Mostrar confirmación amigable
  errEl.classList.remove('hidden');
  errEl.className = 'bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold p-2.5 rounded-xl';
  errEl.textContent = `¡Hola ${profile.fullName}! Identidad confirmada. Completa tu pedido.`;

  // Cambiar al panel invitado (con datos ya rellenados) para confirmar
  switchCheckoutMode('guest');
}

// Confirmar el pedido: crea la orden y abre WhatsApp con datos del residente
async function handleCheckoutConfirm() {
  const ctx = state.checkoutCtx;
  if (!ctx) return;
  const errEl = document.getElementById('checkoutError');
  errEl.classList.add('hidden');
  errEl.className = 'bg-red-50 border border-red-200 text-red-600 text-xs font-bold p-2.5 rounded-xl';

  const fullName = document.getElementById('coGuestName').value.trim();
  const phone = document.getElementById('coGuestPhone').value.trim();
  const tower = document.getElementById('coGuestTower').value;
  const apartment = document.getElementById('coGuestApt').value.trim();
  const birthDate = document.getElementById('coGuestBirth').value;
  const deliveryAddress = document.getElementById('coGuestDelivery').value.trim();
  const termsAccepted = document.getElementById('coGuestTerms').checked;

  if (!fullName || !phone || !tower || !apartment || !birthDate) {
    errEl.textContent = 'Completa nombre, teléfono, torre, apartamento y fecha de nacimiento.';
    errEl.classList.remove('hidden');
    return;
  }
  if (!deliveryAddress) {
    errEl.textContent = 'Indica la dirección de entrega de tu pedido.';
    errEl.classList.remove('hidden');
    return;
  }
  if (!termsAccepted) {
    errEl.textContent = 'Debes aceptar los Términos y Condiciones para continuar.';
    errEl.classList.remove('hidden');
    return;
  }

  const confirmBtn = document.getElementById('checkoutConfirmBtn');
  confirmBtn.disabled = true;
  confirmBtn.innerHTML = '<span>Guardando...</span>';

  // Registrar/actualizar la identidad como vecino (guest checkout usa los datos del formulario,
  // que ya vienen autocompletados tras el login del residente cuando aplica)
  const guestData = { fullName, phone, tower, apartment, birthDate, deliveryAddress };
  const g = await API.guestCheckout(guestData);
  if (!g.success) {
    errEl.textContent = g.message || 'No pudimos guardar tus datos.';
    errEl.classList.remove('hidden');
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = '<i class="fa-brands fa-whatsapp"></i><span>Confirmar pedido y enviar por WhatsApp</span>';
    return;
  }
  const resident = g.data.resident;

  // Crear la orden (siempre se registra)
  const orderPayload = {
    businessId: ctx.business.id,
    products: ctx.products.map(p => ({ name: p.name, price: p.price, qty: p.qty || 1 })),
    resident: {
      fullName: resident.fullName,
      phone: resident.phone,
      tower: resident.tower,
      apartment: resident.apartment,
      deliveryAddress: resident.deliveryAddress,
      authType: resident.authType || 'guest'
    }
  };
  await API.createOrder(orderPayload);

  // Abrir WhatsApp con los datos del residente y el producto
  document.getElementById('checkoutModal').classList.add('hidden');
  const msg = buildOrderMessage(ctx, resident);
  openWhatsAppPreview(ctx.business.name, ctx.business.phone, msg);
  state.checkoutCtx = null;
}

// Construye el mensaje de WhatsApp del pedido con datos del residente
function buildOrderMessage(ctx, resident) {
  const products = ctx.products.map(p => `${p.name}${p.qty > 1 ? ` ×${p.qty}` : ''}`).join(', ');
  return `Hola, soy ${resident.fullName}, vecino de Los Naranjos (Torre ${resident.tower}, Apartamento ${resident.apartment}).\n\nQuisiera pedir de tu vitrina:\n• ${products}\n\nDirección de entrega: ${resident.deliveryAddress || 'Por coordinar'}\n\nMi teléfono: ${resident.phone}`;
}

// ============================================================
// MODAL PQRS (Formulario de solicitud del residente)
// ============================================================
let selectedPqrsTipo = 'Petición';

async function openPqrsModal() {
  // Autocompletar si ya hay perfil guardado
  const prof = API.getStoredResidentProfile();
  if (prof) {
    document.getElementById('pqrsNombre').value = prof.fullName || '';
    document.getElementById('pqrsTelefono').value = (prof.phone || '').replace('57', '');
  }
  resetPqrsTipo();
  document.getElementById('pqrsError').classList.add('hidden');
  document.getElementById('pqrsModal').classList.remove('hidden');
}

function resetPqrsTipo() {
  document.querySelectorAll('.pqrs-tipo-btn').forEach(b => {
    const active = b.dataset.tipo === selectedPqrsTipo;
    b.className = `pqrs-tipo-btn py-2 rounded-xl border text-[10px] font-extrabold touch-btn ${active ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-600'}`;
  });
}

window.closePqrsModal = () => document.getElementById('pqrsModal').classList.add('hidden');

async function handlePqrsSubmit() {
  const errEl = document.getElementById('pqrsError');
  errEl.classList.add('hidden');

  const nombre = document.getElementById('pqrsNombre').value.trim();
  const telefono = document.getElementById('pqrsTelefono').value.trim();
  const descripcion = document.getElementById('pqrsDesc').value.trim();

  if (!nombre || !telefono || !descripcion) {
    errEl.textContent = 'Completa nombre, teléfono y descripción.';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('pqrsSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = '<span>Radicando...</span>';

  const res = await API.sendPqrs({ tipo: selectedPqrsTipo, descripcion, nombre, telefono });

  btn.disabled = false;
  btn.innerHTML = 'Radicar PQRS';

  if (res.success) {
    errEl.className = 'bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold p-2.5 rounded-xl';
    errEl.classList.remove('hidden');
    errEl.textContent = `✓ ${res.message} Tu radicado es: ${res.data.ticketId}`;
    document.getElementById('pqrsNombre').value = '';
    document.getElementById('pqrsTelefono').value = '';
    document.getElementById('pqrsDesc').value = '';
    setTimeout(() => errEl.classList.add('hidden'), 6000);
  } else {
    errEl.className = 'bg-red-50 border border-red-200 text-red-600 text-xs font-bold p-2.5 rounded-xl';
    errEl.textContent = res.message || 'No pudimos radicar la PQRS.';
    errEl.classList.remove('hidden');
  }
}

// ============================================================
// ESTADÍSTICAS DE LA COMUNIDAD (portada)
// ============================================================
const DAY_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

// Registra una visita (1 por día/sesión) y pinta las tarjetas
async function loadStatsAndRecordVisit() {
  const today = new Date().toISOString().slice(0, 10);
  const key = `vd_visited_${today}`;
  if (!sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, '1');
    API.registerVisit();
  }
  const stats = await API.getStats();
  renderStats(stats);
}

function renderStats(stats) {
  if (!stats) return;
  const visitsEl = document.getElementById('statVisitsToday');
  const entrepEl = document.getElementById('statEntrepreneurs');
  const panel = document.getElementById('statsWeekPanel');
  const barsEl = document.getElementById('statsWeekBars');
  if (visitsEl) visitsEl.innerText = (stats.todayVisits || 0).toLocaleString('es-CO');
  if (entrepEl) entrepEl.innerText = (stats.totalEntrepreneurs || 0).toLocaleString('es-CO');
  if (!panel || !barsEl || !stats.last7Days || stats.last7Days.length === 0) return;

  const days = stats.last7Days;
  const max = Math.max(1, ...days.map(d => d.visits || 0));
  const barMaxPx = 48;

  barsEl.innerHTML = days.map(d => {
    const hpx = Math.max(4, Math.round(((d.visits || 0) / max) * barMaxPx));
    const dt = new Date(d.date.replace(/-/g, '/') + ' 12:00:00');
    const letter = DAY_LETTERS[dt.getDay()];
    return `
      <div class="flex flex-col items-center gap-1 flex-1 min-w-0" title="${d.date}: ${d.visits} visita(s)"">
        <span class="text-[9px] font-extrabold text-orange-600">${(d.visits || 0) > 0 ? d.visits : ''}</span>
        <div class="w-full rounded-t-md bg-gradient-to-t from-orange-500 to-amber-400" style="height:${hpx}px"></div>
        <span class="text-[9px] font-bold text-slate-400">${letter}</span>
      </div>`;
  }).join('');
  panel.classList.remove('hidden');
}

// ============================================================
// SOPORTE PARA EMPRENDEDORES (estilo vitrina: botón Contactar)
// ============================================================
function openSupportModal() {
  const modal = document.getElementById('supportModal');
  modal.classList.remove('hidden');
  const btn = document.getElementById('supportWhatsappBtn');
  const label = document.getElementById('supportWhatsappLabel');
  API.getSupport().then(support => {
    const wa = (support.whatsapp || '').replace(/\D/g, '');
    if (wa) {
      const msg = encodeURIComponent('Hola, necesito ayuda con mi vitrina en Los Naranjos.');
      btn.dataset.wa = `https://wa.me/${wa}?text=${msg}`;
      btn.classList.remove('pointer-events-none', 'opacity-50');
      if (label) label.textContent = wa;
    } else {
      btn.dataset.wa = '';
      btn.classList.add('pointer-events-none', 'opacity-50');
      if (label) label.textContent = 'No configurado';
    }
  });
}

window.closeSupportModal = () => document.getElementById('supportModal').classList.add('hidden');

// Abre WhatsApp del soporte en una pestaña nueva
function handleSupportWhatsApp() {
  const btn = document.getElementById('supportWhatsappBtn');
  if (btn.dataset.wa) window.open(btn.dataset.wa, '_blank');
}

// Asegura que ningun <button> actue como tipo submit (endurece los cierres X/Cerrar/Volver)
function setupActionButtons() {
  document.querySelectorAll('button').forEach((b) => {
    if (!b.hasAttribute('type')) b.type = 'button';
  });
}

// Bloquea el scroll de la pagina mientras haya cualquier modal abierto y lo
// restaura al cerrar: evita que se deslice el fondo detras de la ventana.
function setupModalScrollLock() {
  const modals = document.querySelectorAll('[id$="Modal"]');
  const sync = () => {
    const anyOpen = Array.from(modals).some((el) => !el.classList.contains('hidden'));
    document.body.classList.toggle('modal-open', anyOpen);
  };
  modals.forEach((el) => new MutationObserver(sync).observe(el, { attributes: true, attributeFilter: ['class'] }));
  sync();
}
