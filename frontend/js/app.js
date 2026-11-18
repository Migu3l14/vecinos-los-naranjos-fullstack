import { API } from './api.js';
import { UI } from './ui.js';
import { WhatsAppHelper } from './whatsapp.js';
import { openWompiCheckout } from './wompi.js';
import { setupImageUpload, resetImageUpload, waitForImageUpload, waitForImageUploads } from './upload.js';
import { openShareModal } from './share.js';

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
  favoritesOnly: false,
  selectedBusiness: null,
  selectedOffer: null,
  selectedProduct: null,
  
  // Estado temporal del proceso de registro y pago
  newBizData: null,
  createdBiz: null,
  currentReceipt: null,
  managingBiz: null,

  // Estado de la transacción Wompi / pago
  currentPayment: null,        // { transactionId, reference, widgetActive, ... }
  paymentPollTimer: null,

  // Estado del checkout (identidad ya capturada + pedido)
  checkoutCtx: null,           // { business, products: [...], mode, resident, fromCart }
  pendingCheckout: null,       // pedido que espera a que el comprador ingrese
  cartBizId: null,             // vitrina cuyo carrito está abierto
  productCartMsgTimer: null,
  towersList: []
};

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  setupActionButtons();
  setupEventListeners();
  setupImageUpload('regCoverImg');
  setupModalScrollLock();

  // La bienvenida es lo primero que se ve. Mientras está abierta no cargamos ni
  // renderizamos la página pesada para que no compita por el hilo principal.
  const startHeavy = async () => {
    await loadInitialData();
    const openedSharedProduct = await openSharedProductFromUrl();
    // Si se llegó desde un enlace de producto, no tapamos el producto con el
    // modal de ingreso: el usuario puede registrarse desde el header cuando quiera.
    if (!openedSharedProduct) maybeShowEntryModal();
    renderMiManzana();
    bindMmDemoToggle();
    bindMmAccordion();
  };
  const welcome = document.querySelector('.vn-wel');
  if (welcome && !welcome.classList.contains('vn-out')) {
    document.addEventListener('vn:bienvenida:closed', startHeavy, { once: true });
  } else {
    startHeavy();
  }
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
      API.getBusinesses({ includeProducts: 'false' })
    ]);

    state.categories = categories;
    state.offers = offers;
    state.businesses = businesses;

    UI.renderCategories(state.categories, state.currentCategory, handleCategorySelect);
    UI.renderOffers(state.offers, handleOpenOffer, handleContactOffer);
    await fetchFilteredBusinesses();
    updateFavoritesUi();

    const todayLabel = document.getElementById('offersDateLabel');
    if (todayLabel) {
      todayLabel.innerText = `Hoy · ${new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' })}`;
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
    // Si se cerró sesión (p. ej. el residente ya no existe en el servidor),
    // mostramos de nuevo el ingreso para que vuelva a registrarse.
    maybeShowEntryModal();
  }
}

// Actualiza el botón del header: "Mi Vitrina" si el usuario tiene una, "Crear mi Vitrina" si no
async function updateMyVitrinaButton() {
  updateMyOrdersButton();
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

function updateMyOrdersButton() {
  const btn = document.getElementById('myOrdersHeaderBtn');
  if (!btn) return;
  const canUse = API.isResidentLoggedIn() && !isGuardProfile();
  btn.classList.toggle('hidden', !canUse);
  btn.classList.toggle('flex', canUse);
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

  const favoritesToggleBtn = document.getElementById('favoritesToggleBtn');
  if (favoritesToggleBtn) {
    favoritesToggleBtn.addEventListener('click', () => {
      state.favoritesOnly = !state.favoritesOnly;
      updateFavoritesUi();
      renderBusinessList();
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

  // Atajo del header: "Publicar mi negocio" (reusa el modal de registro)
  const openRegisterShortcutBtn = document.getElementById('openRegisterShortcutBtn');
  if (openRegisterShortcutBtn) {
    openRegisterShortcutBtn.addEventListener('click', () => {
      document.getElementById('openRegisterModalBtn')?.click();
    });
  }

  // Botones del Asistente de Registro (Wizard)
  const step1NextBtn = document.getElementById('step1NextBtn');
  if (step1NextBtn) step1NextBtn.addEventListener('click', handleStep1Next);

  const step2BackBtn = document.getElementById('step2BackBtn');
  if (step2BackBtn) step2BackBtn.addEventListener('click', () => showWizardStep(1));

  const step2NextBtn = document.getElementById('step2NextBtn');
  if (step2NextBtn) step2NextBtn.addEventListener('click', handleStep2Submit);

  const addProductBtn = document.getElementById('regAddProductBtn');
  if (addProductBtn) addProductBtn.addEventListener('click', () => createRegisterProductRow());

  const regProductsList = document.getElementById('regProductsList');
  if (regProductsList) {
    regProductsList.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('[data-reg-remove]');
      if (!removeBtn) return;
      removeBtn.closest('[data-reg-product]')?.remove();
      refreshRegisterProductRows();
    });
  }

  const previewBackBtn = document.getElementById('previewBackBtn');
  if (previewBackBtn) previewBackBtn.addEventListener('click', () => showWizardStep(2));

  const previewPayBtn = document.getElementById('previewPayBtn');
  if (previewPayBtn) previewPayBtn.addEventListener('click', handlePreviewConfirm);

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

  const myOrdersHeaderBtn = document.getElementById('myOrdersHeaderBtn');
  if (myOrdersHeaderBtn) myOrdersHeaderBtn.addEventListener('click', openMyOrders);

  // Botón abrir modal Soporte
  const openSupportBtn = document.getElementById('openSupportModalBtn');
  if (openSupportBtn) openSupportBtn.addEventListener('click', openSupportModal);

  // Botón abrir modal Compartir (enlace + QR)
  const openShareBtn = document.getElementById('openShareModalBtn');
  if (openShareBtn) openShareBtn.addEventListener('click', openShareModal);

  // Botón copiar enlace del modal Compartir
  const copyShareBtn = document.getElementById('copyShareLinkBtn');
  if (copyShareBtn) copyShareBtn.addEventListener('click', () => {
    if (typeof window.copyShareLink === 'function') window.copyShareLink();
  });

  // Botón compartir por WhatsApp del modal Compartir (envía el QR como imagen)
  const shareWaBtn = document.getElementById('shareWhatsAppBtn');
  if (shareWaBtn) shareWaBtn.addEventListener('click', () => {
    if (typeof window.handleShareWhatsApp === 'function') window.handleShareWhatsApp();
  });

  // Botón Contactar por WhatsApp del modal Soporte
  const supportWaBtn = document.getElementById('supportWhatsappBtn');
  if (supportWaBtn) supportWaBtn.addEventListener('click', handleSupportWhatsApp);

  // Botón y enlaces del modal Términos y Condiciones
  const openTermsBtn = document.getElementById('openTermsBtn');
  if (openTermsBtn) openTermsBtn.addEventListener('click', openTermsModal);
  const goWelcome = () => { try { localStorage.removeItem('vn_bienvenida_vista'); } catch(e){} location.href = (location.pathname.endsWith('/') ? location.pathname : location.pathname.replace(/[^/]*$/, '')) + '?bienvenida=1'; };
  const reopenWelcomeBtn = document.getElementById('reopenWelcomeBtn');
  if (reopenWelcomeBtn) reopenWelcomeBtn.addEventListener('click', goWelcome);
  document.querySelectorAll('[data-reopen-welcome]').forEach((b) => b.addEventListener('click', goWelcome));
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
  const coQty = document.getElementById('checkoutQty');
  if (coQty) {
    coQty.addEventListener('input', () => {
      const ctx = state.checkoutCtx;
      if (!ctx || ctx.products.length !== 1) return;
      const qty = clampQty(coQty.value);
      ctx.products[0].qty = qty;
      refreshCheckoutSummary();
      if (ctx.fromCart) {
        saveCartItems(ctx.business.id, [{
          key: ctx.products[0].key || cartItemKey(ctx.products[0]),
          id: ctx.products[0].id || '',
          name: ctx.products[0].name || '',
          price: ctx.products[0].price || '',
          qty
        }]);
      }
    });
    coQty.addEventListener('blur', () => { coQty.value = clampQty(coQty.value); });
  }

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

  document.querySelectorAll('[data-close-product-detail]').forEach((el) => {
    el.addEventListener('click', closeProductDetail);
  });

  const productWaBtn = document.getElementById('productDetailWaBtn');
  if (productWaBtn) {
    productWaBtn.addEventListener('click', () => {
      if (!state.selectedProduct) return;
      const { biz, product } = state.selectedProduct;
      orderProduct(biz, product);
    });
  }

  const productShareBtn = document.getElementById('productDetailShareBtn');
  if (productShareBtn) {
    productShareBtn.addEventListener('click', shareSelectedProductLink);
  }

  const productAddBtn = document.getElementById('productDetailAddBtn');
  if (productAddBtn) {
    productAddBtn.addEventListener('click', () => {
      if (!state.selectedProduct) return;
      const { biz, product } = state.selectedProduct;
      addToCart(biz, product, 1);
      showProductCartMsg('Agregado al carrito');
    });
  }

  const cartViewBtn = document.getElementById('cartViewBtn');
  if (cartViewBtn) cartViewBtn.addEventListener('click', openCartModal);
  const productViewCartBtn = document.getElementById('productDetailViewCartBtn');
  if (productViewCartBtn) productViewCartBtn.addEventListener('click', openCartModal);
  const cartCheckoutBtn = document.getElementById('cartCheckoutBtn');
  if (cartCheckoutBtn) cartCheckoutBtn.addEventListener('click', continueCartCheckout);
  const cartClearBtn = document.getElementById('cartClearBtn');
  if (cartClearBtn) {
    cartClearBtn.addEventListener('click', () => {
      if (state.cartBizId) clearCart(state.cartBizId);
    });
  }
  const cartItemsEl = document.getElementById('cartItems');
  if (cartItemsEl) {
    cartItemsEl.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-cart-action]');
      if (!btn || !state.cartBizId) return;
      const index = Number(btn.dataset.index);
      const action = btn.dataset.cartAction;
      if (action === 'remove') removeCartItem(state.cartBizId, index);
      else adjustCartQty(state.cartBizId, index, action === 'plus' ? 1 : -1);
    });
  }

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
// ==========================================
// FAVORITOS DE VITRINAS (persistidos en el navegador)
// ==========================================
const FAVORITES_KEY = 'vn_favorites_v1';

function readFavoriteIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return Array.isArray(raw) ? raw.map(String) : [];
  } catch (e) {
    return [];
  }
}

function writeFavoriteIds(ids) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch (e) {
    console.warn('No se pudieron guardar los favoritos:', e);
  }
}

function toggleFavorite(bizId) {
  const id = String(bizId);
  const ids = readFavoriteIds();
  const index = ids.indexOf(id);
  if (index >= 0) ids.splice(index, 1);
  else ids.push(id);
  writeFavoriteIds(ids);
  updateFavoritesUi();
  renderBusinessList();
}

function updateFavoritesUi() {
  const count = readFavoriteIds().length;
  const countBadge = document.getElementById('favoritesCountBadge');
  const button = document.getElementById('favoritesToggleBtn');
  if (countBadge) countBadge.textContent = count;
  if (!button) return;
  button.setAttribute('aria-pressed', state.favoritesOnly ? 'true' : 'false');
  button.classList.toggle('bg-rose-600', state.favoritesOnly);
  button.classList.toggle('border-rose-600', state.favoritesOnly);
  button.classList.toggle('text-white', state.favoritesOnly);
  button.classList.toggle('hover:bg-rose-700', state.favoritesOnly);
  button.classList.toggle('bg-white', !state.favoritesOnly);
  button.classList.toggle('border-rose-200', !state.favoritesOnly);
  button.classList.toggle('text-rose-600', !state.favoritesOnly);
  button.classList.toggle('hover:bg-rose-50', !state.favoritesOnly);
  const icon = button.querySelector('i');
  if (icon) {
    icon.classList.toggle('fa-solid', state.favoritesOnly);
    icon.classList.toggle('fa-regular', !state.favoritesOnly);
  }
}

function bindFavoriteButtons() {
  document.querySelectorAll('#businessList .btn-favorite').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFavorite(el.dataset.id);
    });
  });
}

function updateListHeading() {
  const listTitle = document.getElementById('listTitle');
  const listSubtitle = document.getElementById('listSubtitle');
  const catObj = state.categories.find(c => c.id === state.currentCategory);
  if (state.favoritesOnly) {
    if (listTitle) listTitle.innerText = '❤️ Mis favoritos';
    if (listSubtitle) listSubtitle.innerText = 'Las vitrinas que guardaste en este dispositivo';
    return;
  }
  if (listTitle) listTitle.innerText = state.currentCategory === 'all' ? '⭐ Negocios destacados' : `Categoría: ${catObj ? catObj.name : state.currentCategory}`;
  if (listSubtitle) {
    listSubtitle.innerText = state.currentCategory === 'all'
      ? 'Los vecinos mejor valorados de Los Naranjos'
      : `Vitrinas de ${catObj ? catObj.name.toLowerCase() : 'esta categoría'} en tu conjunto`;
  }
}

async function fetchFilteredBusinesses() {
  const params = {};
  if (state.currentCategory !== 'all') params.category = state.currentCategory;
  if (state.currentManzana !== 'all') params.manzana = state.currentManzana;
  if (state.currentSearch.trim() !== '') params.q = state.currentSearch;
  params.includeProducts = 'false';

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
  const favoriteIds = new Set(readFavoriteIds());
  const visible = state.favoritesOnly
    ? state.businesses.filter(biz => favoriteIds.has(String(biz.id)))
    : state.businesses;

  // "Destacados": mejor calificados primero; a igual rating, los que tienen badge
  const sorted = [...visible].sort((a, b) => {
    const ra = parseFloat(a.rating) || 0;
    const rb = parseFloat(b.rating) || 0;
    if (rb !== ra) return rb - ra;
    return (b.badge ? 1 : 0) - (a.badge ? 1 : 0);
  });

  // Mapa bizId -> oferta activa (para la etiqueta "% OFF" solo con datos reales)
  const offerByBiz = {};
  (state.offers || []).forEach(o => { if (o.bizId) offerByBiz[o.bizId] = o; });

  const emptyState = state.favoritesOnly
    ? { icon: '❤️', title: 'Aún no tienes favoritos', text: 'Toca el corazón de una vitrina para guardarla aquí.' }
    : null;

  updateListHeading();
  UI.renderBusinesses(sorted, state.categories, offerByBiz, handleOpenProfile, handleQuickWhatsApp, favoriteIds, emptyState);
  bindFavoriteButtons();
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
  mode: (API.getStoredResidentProfile() && API.getStoredResidentProfile().role === 'guard')
    ? 'guest'
    : (API.isResidentLoggedIn() ? 'resident' : 'guest'),
  manzana: (API.getStoredResidentProfile() && API.getStoredResidentProfile().manzana) || '3'
};

// El guarda de seguridad (rol 'guard') ve solo la vitrina pública: no entra al
// contenido privado de "Mi Manzana" aunque tenga sesión activa.
function isGuardProfile() {
  const prof = API.getStoredResidentProfile();
  return !!(prof && prof.role === 'guard');
}

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

  if (isGuardProfile()) mmState.mode = 'guest';
  updateMyOrdersButton();

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
  updateListHeading();
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
            <span class="text-[9px] text-slate-400">${new Date(r.createdAt).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}</span>
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

  const prods = (biz.products || []).map((p, index) => ({
    index,
    id: String(p.id || ''),
    name: String(p.name || ''),
    description: String(p.description || ''),
    photo: String(p.photo || p.image || biz.coverImage || ''),
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
      grupos[cat].forEach((prod) => {
        const agotado = prod.availability === 'agotado';
        productsHtml += `
          <div class="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 border border-slate-100">
            <button type="button" data-proddetail="${prod.index}" class="flex items-center space-x-2.5 min-w-0 flex-1 text-left">
              <img src="${escHtml(prod.photo)}" alt="${escHtml(prod.name)}" class="w-12 h-12 rounded-lg object-contain flex-shrink-0 bg-slate-200"/>
              <div class="min-w-0">
                <h5 class="text-xs font-bold text-slate-800 leading-tight">${escHtml(prod.name)}</h5>
                ${prod.price ? `<span class="text-xs font-extrabold text-emerald-600">${escHtml(prod.price)}</span>` : ''}
                ${agotado ? '<span class="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Agotado</span>' : ''}
                ${prod.description ? `<p class="text-[10px] text-slate-500 truncate">${escHtml(prod.description)}</p>` : ''}
              </div>
            </button>
            <div class="flex flex-col gap-1 flex-shrink-0">
              ${agotado ? '' : `<button type="button" data-prodcart="${prod.index}" title="Agregar al carrito" aria-label="Agregar ${escHtml(prod.name)} al carrito" class="prod-cart-btn px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold rounded-lg flex items-center justify-center shadow">
                <i class="fa-solid fa-cart-plus"></i>
              </button>`}
              <button type="button" data-prodwa="${prod.index}" data-cat="${escHtml(cat)}" class="prod-wa-btn px-2.5 py-1 bg-[#25D366] hover:bg-[#1ebd59] text-white text-[10px] font-bold rounded-lg flex items-center space-x-1 shadow">
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

  productsContainer.querySelectorAll('[data-proddetail]').forEach(btn => {
    btn.addEventListener('click', () => {
      const prod = prods[Number(btn.dataset.proddetail)];
      if (prod) openProductDetail(biz, prod);
    });
  });

  productsContainer.querySelectorAll('[data-prodcart]').forEach(btn => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const prod = prods[Number(btn.dataset.prodcart)];
      if (!prod) return;
      addToCart(biz, prod, 1);
      flashCartButton(btn);
    });
  });

  productsContainer.querySelectorAll('[data-prodwa]').forEach(btn => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const prod = prods[Number(btn.dataset.prodwa)];
      if (!prod) return;
      orderProduct(biz, prod);
    });
  });

  const mainWhatsAppBtn = document.getElementById('modalMainWhatsAppBtn');
  mainWhatsAppBtn.onclick = () => {
    const msg = WhatsAppHelper.buildGeneralMessage(biz);
    openWhatsAppPreview(biz.name, biz.phone, msg);
  };

  const repeatBtn = document.getElementById('repeatOrderBtn');
  if (repeatBtn) repeatBtn.onclick = () => repeatLastOrder(biz);

  updateCartBar(biz.id);
  updateRepeatOrderBar(biz.id);
  document.getElementById('profileModal').classList.remove('hidden');
}

function repeatLastOrder(biz) {
  const last = readLastOrder();
  if (!last || String(last.businessId) !== String(biz.id)) return;
  const products = last.products.map(p => ({ ...p, qty: clampQty(p.qty || 1) }));
  window.closeProfileModal();
  openCheckoutFor(biz, products, {
    observations: last.observations || '',
    paymentMethod: last.paymentMethod || 'Efectivo'
  });
}

function openProductDetail(biz, product) {
  state.selectedProduct = { biz, product };
  const img = document.getElementById('productDetailImg');
  img.src = product.photo || biz.coverImage || '';
  img.alt = product.name || 'Producto';
  img.style.display = '';
  img.onerror = () => { img.style.display = 'none'; };

  document.getElementById('productDetailCategory').textContent = product.category || 'General';
  document.getElementById('productDetailName').textContent = product.name || '';
  document.getElementById('productDetailBiz').textContent = `Manzana ${biz.manzana} · ${biz.name}`;
  document.getElementById('productDetailPrice').textContent = product.price || '';
  document.getElementById('productDetailPrice').classList.toggle('hidden', !product.price);
  const desc = document.getElementById('productDetailDesc');
  desc.textContent = product.description || 'Este producto no tiene descripción adicional.';
  desc.classList.toggle('text-slate-400', !product.description);

  const agotado = product.availability === 'agotado';
  const availability = document.getElementById('productDetailAvailability');
  availability.textContent = agotado ? 'Agotado' : 'Disponible';
  availability.className = `absolute bottom-3 left-3 text-[10px] font-extrabold px-2.5 py-1 rounded-full text-white ${agotado ? 'bg-red-500' : 'bg-emerald-500'}`;

  const waBtn = document.getElementById('productDetailWaBtn');
  waBtn.innerHTML = `<i class="fa-brands fa-whatsapp text-lg"></i><span>${agotado ? 'Consultar disponibilidad' : 'Pedir este producto'}</span>`;

  const addBtn = document.getElementById('productDetailAddBtn');
  if (addBtn) addBtn.classList.toggle('hidden', agotado);
  const cartMsg = document.getElementById('productDetailCartMsg');
  if (cartMsg) {
    cartMsg.textContent = '';
    cartMsg.classList.add('hidden');
  }
  const viewCartBtn = document.getElementById('productDetailViewCartBtn');
  if (viewCartBtn) viewCartBtn.classList.add('hidden');

  // Solo se puede compartir si el producto tiene id público (enlaces /p/:id).
  const shareBtn = document.getElementById('productDetailShareBtn');
  if (shareBtn) shareBtn.classList.toggle('hidden', !product.id);
  const shareMsg = document.getElementById('productDetailShareMsg');
  if (shareMsg) {
    shareMsg.textContent = '';
    shareMsg.classList.add('hidden');
  }

  document.getElementById('productDetailModal').classList.remove('hidden');
  document.getElementById('productDetailModal').classList.add('flex');
}

function closeProductDetail() {
  const modal = document.getElementById('productDetailModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  state.selectedProduct = null;
}

// Copia el enlace público /p/:id del producto abierto (vista previa en WhatsApp)
async function shareSelectedProductLink() {
  const selected = state.selectedProduct;
  const msg = document.getElementById('productDetailShareMsg');
  if (!selected || !selected.product || !selected.product.id) return;

  const url = `${window.location.origin}/p/${encodeURIComponent(String(selected.product.id))}`;
  let copied = false;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url);
      copied = true;
    }
  } catch (e) {
    copied = false;
  }

  if (!copied) {
    try {
      const helper = document.createElement('textarea');
      helper.value = url;
      helper.setAttribute('readonly', '');
      helper.style.position = 'fixed';
      helper.style.top = '-1000px';
      helper.style.opacity = '0';
      document.body.appendChild(helper);
      helper.select();
      copied = document.execCommand('copy');
      helper.remove();
    } catch (e) {
      copied = false;
    }
  }

  if (!msg) return;
  msg.textContent = copied
    ? 'Enlace copiado. Pégalo en tu chat de WhatsApp.'
    : `No se pudo copiar. Mantén presionado este enlace: ${url}`;
  msg.className = `text-[11px] font-bold text-center ${copied ? 'text-emerald-600' : 'text-red-600 break-all'}`;
  msg.classList.remove('hidden');
  window.clearTimeout(state.shareMsgTimer);
  state.shareMsgTimer = window.setTimeout(() => msg.classList.add('hidden'), copied ? 3500 : 12000);
}

// Abre el producto cuando se llega desde un enlace compartido /p/:id
// (la página pública redirige a /?producto=<pid>&vitrina=<bizId>).
async function openSharedProductFromUrl() {
  let productId = null;
  let businessId = null;
  try {
    const params = new URLSearchParams(window.location.search);
    productId = params.get('producto');
    businessId = params.get('vitrina');
  } catch (e) {
    return false;
  }
  if (!productId || !businessId) return false;

  try {
    await handleOpenProfile(businessId);
    const biz = state.selectedBusiness;
    if (!biz || String(biz.id) !== String(businessId)) return false;

    const raw = (biz.products || []).find(p => String(p.id) === String(productId));
    if (!raw) return false;

    openProductDetail(biz, {
      id: raw.id,
      name: String(raw.name || ''),
      description: String(raw.description || ''),
      photo: String(raw.photo || raw.image || biz.coverImage || ''),
      price: String(raw.price || ''),
      category: String(raw.category || 'General'),
      availability: raw.availability === 'agotado' ? 'agotado' : 'activo'
    });

    window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`);
    return true;
  } catch (e) {
    console.error('No se pudo abrir el producto compartido:', e);
    return false;
  }
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
let regProductSeq = 0;

function readCropInput(id) {
  const input = document.getElementById(id);
  if (!input || !input.value) return null;
  try {
    const crop = JSON.parse(input.value);
    return crop && typeof crop === 'object' ? crop : null;
  } catch {
    return null;
  }
}

function refreshRegisterProductRows() {
  const list = document.getElementById('regProductsList');
  if (!list) return;
  const rows = [...list.querySelectorAll('[data-reg-product]')];
  rows.forEach((row, index) => {
    const label = row.querySelector('[data-reg-label]');
    if (label) label.textContent = `Producto ${index + 1}`;
  });
  let empty = list.querySelector('[data-reg-empty]');
  if (rows.length === 0) {
    if (!empty) {
      list.insertAdjacentHTML('beforeend', '<p data-reg-empty class="text-center text-[11px] text-slate-400 py-3">Aún no hay productos. Agrega el que quieras.</p>');
    }
  } else if (empty) {
    empty.remove();
  }
  const count = document.getElementById('regProductsCount');
  if (count) count.textContent = `${rows.length} producto${rows.length === 1 ? '' : 's'}`;
}

function createRegisterProductRow() {
  const list = document.getElementById('regProductsList');
  if (!list) return;
  regProductSeq += 1;
  const baseId = `regProdImg${regProductSeq}`;
  const row = document.createElement('div');
  row.dataset.regProduct = '1';
  row.dataset.baseId = baseId;
  row.className = 'p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2';
  row.innerHTML = `
    <div class="flex items-center justify-between gap-2">
      <span data-reg-label class="font-bold text-orange-600 block">Producto ${regProductSeq}</span>
      <button type="button" data-reg-remove class="text-slate-400 hover:text-red-500 w-7 h-7 rounded-lg flex items-center justify-center" title="Quitar producto">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
    <input type="text" data-field="name" placeholder="Nombre (Ej: Semipermanente o Lasaña Familiar)" class="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white" />
    <div class="grid grid-cols-2 gap-2">
      <input type="text" data-field="price" placeholder="Precio (Ej: $28.000)" class="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white" />
      <div>
        <input type="file" id="${baseId}" accept="image/jpeg,image/png,image/webp" data-crop-aspect="1" class="w-full p-1.5 border border-slate-200 rounded-lg bg-white text-[10px]" />
        <div id="${baseId}_preview" class="hidden mt-1">
          <img id="${baseId}_img" alt="" class="w-16 h-16 object-cover bg-slate-50 rounded-lg border border-slate-200" />
        </div>
        <input type="hidden" id="${baseId}_url" />
        <input type="hidden" id="${baseId}_original_url" />
        <input type="hidden" id="${baseId}_crop" />
        <button type="button" data-crop-edit="${baseId}" class="hidden mt-1 text-[10px] font-bold text-orange-600 hover:text-orange-700">Ajustar encuadre</button>
        <p id="${baseId}_err" class="hidden text-red-600 text-[10px] font-bold"></p>
      </div>
    </div>`;
  list.appendChild(row);
  setupImageUpload(baseId);
  refreshRegisterProductRows();
}

function resetRegisterProducts(initialCount = 1) {
  const list = document.getElementById('regProductsList');
  if (!list) return;
  regProductSeq = 0;
  list.innerHTML = '';
  for (let i = 0; i < initialCount; i += 1) createRegisterProductRow();
  refreshRegisterProductRows();
}

function resetRegisterWizard() {
  state.newBizData = null;
  state.createdBiz = null;
  state.currentReceipt = null;

  document.getElementById('regName').value = '';
  document.getElementById('regPhone').value = '';
  document.getElementById('regShortDesc').value = '';
  document.getElementById('regHours').value = '';
  resetImageUpload('regCoverImg');
  resetRegisterProducts(1);

  const regTerms = document.getElementById('regTerms');
  if (regTerms) regTerms.checked = false;

  showWizardStep(1);
}

function showWizardStep(step) {
  const steps = ['1', '2', 'preview', '3', '4'];
  steps.forEach((s) => {
    const el = document.getElementById(s === 'preview' ? 'wizardStepPreview' : `wizardStep${s}`);
    if (el) el.classList.toggle('hidden', s !== String(step));
  });
}

// Paso 1: Validar datos principales
async function handleStep1Next() {
  const name = document.getElementById('regName').value.trim();
  const manzana = document.getElementById('regMz').value;
  const category = document.getElementById('regCat').value;
  const phone = document.getElementById('regPhone').value.trim();
  const shortDesc = document.getElementById('regShortDesc').value.trim();
  const hours = document.getElementById('regHours').value.trim();
  const instagram = document.getElementById('regInstagram').value.trim();
  const facebook = document.getElementById('regFacebook').value.trim();

  if (!name || !phone) {
    alert('Por favor ingresa el nombre de tu emprendimiento y tu número de WhatsApp.');
    return;
  }

  await waitForImageUpload('regCoverImg');
  const coverImage = document.getElementById('regCoverImg_url').value.trim();
  const coverImageOriginal = document.getElementById('regCoverImg_original_url')?.value.trim() || '';
  const coverImageCrop = readCropInput('regCoverImg_crop');

  state.newBizData = {
    name,
    manzana,
    category,
    phone,
    shortDesc: shortDesc || `Emprendimiento de la Manzana ${manzana} en Los Naranjos.`,
    hours: hours || 'Lunes a Sábado: 8:00 AM - 7:00 PM',
    coverImage: coverImage || 'https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=800&q=80',
    coverImageOriginal: coverImageOriginal || null,
    coverImageCrop,
    delivery: 'Domicilio / Entrega en Los Naranjos',
    instagram: instagram || null,
    facebook: facebook || null
  };

  showWizardStep(2);
}

// Paso 2: Validar productos y pasar a la Vista Previa (aún NO se crea en el backend)
async function handleStep2Submit() {
  const regTerms = document.getElementById('regTerms');
  if (regTerms && !regTerms.checked) {
    alert('Debes aceptar los Términos y Condiciones para activar tu vitrina.');
    return;
  }

  const rows = [...document.querySelectorAll('[data-reg-product]')];
  await waitForImageUploads(rows.map((row) => row.dataset.baseId));

  const products = [];
  rows.forEach((row) => {
    const baseId = row.dataset.baseId;
    const name = row.querySelector('[data-field="name"]')?.value.trim() || '';
    if (!name) return;
    const price = row.querySelector('[data-field="price"]')?.value.trim() || '$20.000';
    const photo = document.getElementById(`${baseId}_url`)?.value.trim() || '';
    const photoOriginal = document.getElementById(`${baseId}_original_url`)?.value.trim() || '';
    const photoCrop = readCropInput(`${baseId}_crop`);
    const image = photo || state.newBizData.coverImage;
    products.push({
      name,
      price,
      image,
      photo: image,
      photoOriginal: photoOriginal || null,
      photoCrop,
      description: '',
      category: 'General',
      availability: 'disponible'
    });
  });

  state.newBizData.products = products;

  // Mostrar la vista previa antes de crear la vitrina y pasar al pago
  renderVitrinaPreview(state.newBizData);
  showWizardStep('preview');
}

// Paso 2.5: Confirma la vista previa → crea la vitrina ACTIVA con 1 mes gratis.
// El pago se solicita desde el segundo mes (renovación), no al crear.
async function handlePreviewConfirm() {
  if (!state.newBizData) {
    showWizardStep(1);
    return;
  }

  const btn = document.getElementById('previewPayBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Creando tu vitrina...</span>';
  }

  const res = await API.registerBusiness(state.newBizData);

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-rocket"></i><span>Crear mi vitrina (1 mes gratis)</span>';
  }

  if (!res.success) {
    alert('Error al registrar la vitrina: ' + (res.message || 'Intenta de nuevo.'));
    return;
  }

  state.createdBiz = res.data;

  // Refrescar el directorio para que la vitrina aparezca de inmediato
  loadInitialData();

  // Mostrar confirmación de activación (mes gratis). El pago se hará al renovar.
  const receiptBox = document.getElementById('receiptDetailContainer');
  if (receiptBox) {
    const days = res.data.daysRemaining || 30;
    receiptBox.innerHTML = `
      <div class="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 space-y-1">
        <p class="font-extrabold">🎉 ¡Tu vitrina está activa con 1 mes gratis!</p>
        <p><b>${res.data.name}</b> · Manzana ${res.data.manzana}</p>
        <p>Días restantes de prueba: <b>${days}</b></p>
        <p class="text-[11px] text-emerald-800 pt-1">Al terminar tu mes gratis, deberás realizar el pago de <b>$31.600 COP</b> para renovar y mantener tu vitrina visible. Podrás pagar desde “Mi Vitrina”.</p>
      </div>`;
  }
  const title = document.getElementById('wizardStep4Title');
  if (title) title.textContent = '¡Tu Vitrina ya está activa (1 mes gratis)!';
  const sub = document.getElementById('wizardStep4Sub');
  if (sub) sub.textContent = 'Ya es visible para la comunidad. El pago se solicitará desde el segundo mes.';

  const viewBtn = document.getElementById('viewLiveStoreBtn');
  if (viewBtn) viewBtn.onclick = () => { closeRegisterWizard(); if (state.createdBiz?.id) handleOpenProfile(state.createdBiz.id); };

  const dl = document.getElementById('downloadReceiptBtn');
  if (dl) dl.classList.add('hidden');
  const wa = document.getElementById('shareReceiptWaBtn');
  if (wa) wa.classList.add('hidden');

  showWizardStep(4);
}

// Renderiza un mock de la vitrina tal como se verá publicada (sin tocar el backend)
function renderVitrinaPreview(biz) {
  const container = document.getElementById('vitrinaPreview');
  if (!container || !biz) return;

  const cover = escHtml(biz.coverImage || '');
  const category = escHtml(String(biz.category || '').toUpperCase());
  const name = escHtml(biz.name || '');
  const manzana = escHtml(String(biz.manzana || ''));
  const shortDesc = escHtml(biz.shortDesc || '');
  const fullDesc = escHtml(biz.fullDesc || biz.shortDesc || '');
  const hours = escHtml(biz.hours || '');
  const delivery = escHtml(biz.delivery || '');
  const products = Array.isArray(biz.products) ? biz.products : [];

  const previewProducts = products.slice(0, 8);
  const productsHtml = products.length
    ? previewProducts.map((p) => `
        <div class="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-100">
          <img src="${escHtml(p.photo || p.image || biz.coverImage || '')}" alt="${escHtml(p.name || '')}" loading="lazy" class="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-slate-200" onerror="this.style.display='none'"/>
          <div class="min-w-0">
            <h5 class="text-xs font-bold text-slate-800 leading-tight">${escHtml(p.name || '')}</h5>
            ${p.price ? `<span class="text-xs font-extrabold text-emerald-600">${escHtml(p.price)}</span>` : ''}
          </div>
        </div>`).join('') + (products.length > previewProducts.length
      ? `<p class="text-[11px] text-slate-400 text-center pt-1">y ${products.length - previewProducts.length} producto${products.length - previewProducts.length === 1 ? '' : 's'} más</p>`
      : '')
    : '<p class="text-xs text-slate-400 text-center py-3">A\u00fan no agregaste productos.</p>';

  container.innerHTML = `
    <div class="relative aspect-video bg-slate-100">
      <img src="${cover}" alt="${name}" class="w-full h-full object-cover object-center" onerror="this.style.display='none'"/>
      <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none"></div>
      <span class="absolute top-3 left-3 bg-black/70 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">Mz ${manzana}</span>
      <div class="absolute bottom-3 left-3 right-3 text-white">
        <span class="bg-orange-500 text-white text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full">${category}</span>
        <h2 class="text-lg font-extrabold leading-tight mt-1">${name}</h2>
        <div class="flex items-center space-x-2 text-[11px] text-slate-200 mt-0.5">
          <span class="font-semibold">&#128205; Manzana ${manzana} (Los Naranjos)</span>
          <span>&bull;</span>
          <span class="text-amber-400 font-bold">&#9733; 5.0 &middot; 1 recomendaci&oacute;n</span>
        </div>
      </div>
    </div>
    <div class="p-3 space-y-3">
      <div>
        <h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sobre el emprendimiento</h4>
        <p class="text-xs text-slate-600 mt-1 leading-relaxed">${fullDesc}</p>
      </div>
      <div class="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl text-[11px]">
        <div>
          <span class="text-slate-400 font-semibold block">&#128337; Horario</span>
          <span class="font-bold text-slate-800">${hours}</span>
        </div>
        <div>
          <span class="text-slate-400 font-semibold block">&#128757; Domicilio</span>
          <span class="font-bold text-emerald-600">${delivery}</span>
        </div>
      </div>
      <div>
        <h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Cat&aacute;logo de productos y precios</h4>
        <div class="space-y-2">${productsHtml}</div>
      </div>
      <div class="bg-[#25D366]/10 border border-[#25D366]/30 text-[#128C4B] text-[11px] font-bold p-2.5 rounded-xl flex items-center justify-center space-x-2">
        <i class="fa-brands fa-whatsapp"></i><span>Contactar por WhatsApp (vista previa)</span>
      </div>
    </div>`;
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

window.closeProfileModal = () => {
  closeProductDetail();
  document.getElementById('profileModal').classList.add('hidden');
};
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

// ============================================================
// CARRITO POR VITRINA (un pedido por negocio, persistido en localStorage)
// ============================================================
const CART_KEY = 'vn_carts_v1';
const LAST_ORDER_KEY = 'vn_last_order_v1';

function readLastOrder() {
  try {
    const raw = JSON.parse(localStorage.getItem(LAST_ORDER_KEY) || 'null');
    if (!raw || !raw.businessId || !Array.isArray(raw.products) || raw.products.length === 0) return null;
    return raw;
  } catch (error) {
    return null;
  }
}

function saveLastOrder(order) {
  try {
    localStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order));
  } catch (error) {
    /* sin acción */
  }
}

function updateRepeatOrderBar(bizId) {
  const bar = document.getElementById('repeatOrderBar');
  const totalEl = document.getElementById('repeatOrderTotal');
  if (!bar) return;
  const last = readLastOrder();
  if (!last || String(last.businessId) !== String(bizId)) {
    bar.classList.add('hidden');
    return;
  }
  const total = cartTotal(last.products);
  if (totalEl) {
    totalEl.textContent = total > 0
      ? `${formatCOP(total)}${hasUnknownPrice(last.products) ? ' +' : ''}`
      : '';
  }
  bar.classList.remove('hidden');
}

function readCarts() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || '{}') || {};
  } catch (error) {
    return {};
  }
}

function writeCarts(carts) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(carts));
  } catch (error) {
    /* sin acción */
  }
}

function cartItemKey(product) {
  return String(product.id || product.name || '');
}

function getCartItems(bizId) {
  const carts = readCarts();
  const items = carts[String(bizId)];
  return Array.isArray(items) ? items : [];
}

function saveCartItems(bizId, items) {
  const carts = readCarts();
  const key = String(bizId);
  if (items && items.length > 0) carts[key] = items;
  else delete carts[key];
  writeCarts(carts);
  updateCartBar(bizId);
  if (state.cartBizId === key && !document.getElementById('cartModal').classList.contains('hidden')) {
    renderCartModal(bizId);
  }
}

function parsePrice(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(/\./g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function formatCOP(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function cartTotal(items) {
  return (items || []).reduce((acc, item) => {
    const price = parsePrice(item.price);
    return price == null ? acc : acc + price * (Number(item.qty) || 1);
  }, 0);
}

function hasUnknownPrice(items) {
  return (items || []).some(item => parsePrice(item.price) == null);
}

function addToCart(biz, product, qty = 1) {
  if (!biz || !product) return;
  const items = getCartItems(biz.id);
  const key = cartItemKey(product);
  const found = items.find(item => item.key === key);
  if (found) {
    found.qty = Math.min((Number(found.qty) || 1) + clampQty(qty), 99);
  } else {
    items.push({
      key,
      id: product.id || '',
      name: product.name || '',
      price: product.price || '',
      qty: clampQty(qty)
    });
  }
  saveCartItems(biz.id, items);
}

function adjustCartQty(bizId, index, delta) {
  const items = getCartItems(bizId);
  if (!items[index]) return;
  const next = (Number(items[index].qty) || 1) + delta;
  if (next < 1) {
    removeCartItem(bizId, index);
    return;
  }
  items[index].qty = Math.min(next, 99);
  saveCartItems(bizId, items);
}

function removeCartItem(bizId, index) {
  const items = getCartItems(bizId);
  if (!items[index]) return;
  items.splice(index, 1);
  saveCartItems(bizId, items);
}

function clearCart(bizId) {
  saveCartItems(bizId, []);
}

function updateCartBar(bizId) {
  const bar = document.getElementById('cartBar');
  if (!bar) return;
  const items = getCartItems(bizId);
  const count = items.reduce((acc, item) => acc + (Number(item.qty) || 1), 0);
  if (count === 0) {
    bar.classList.add('hidden');
    return;
  }
  bar.classList.remove('hidden');
  document.getElementById('cartBarText').textContent = `Ver pedido (${count})`;
  const total = cartTotal(items);
  document.getElementById('cartBarTotal').textContent = total > 0
    ? `${formatCOP(total)}${hasUnknownPrice(items) ? ' +' : ''}`
    : '';
}

function renderCartModal(bizId) {
  const items = getCartItems(bizId);
  const box = document.getElementById('cartItems');
  const footer = document.getElementById('cartFooter');
  const biz = state.selectedBusiness;
  document.getElementById('cartBizName').textContent = biz ? biz.name : 'Pedido';

  if (items.length === 0) {
    box.innerHTML = '<p class="text-sm text-slate-400 text-center py-8">Tu carrito está vacío.<br><span class="text-xs">Agrega productos desde la vitrina.</span></p>';
    footer.classList.add('hidden');
    return;
  }

  box.innerHTML = items.map((item, index) => `
    <div class="flex items-center gap-2 p-2 rounded-xl border border-slate-100 bg-slate-50">
      <div class="min-w-0 flex-1">
        <p class="text-xs font-bold text-slate-800 truncate">${escHtml(item.name)}</p>
        <p class="text-[10px] font-semibold text-slate-500">${item.price ? escHtml(item.price) : 'Precio por coordinar'}</p>
      </div>
      <div class="flex items-center gap-1">
        <button type="button" data-cart-action="minus" data-index="${index}" aria-label="Quitar una unidad de ${escHtml(item.name)}" class="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-700 font-extrabold touch-btn">−</button>
        <span class="w-6 text-center text-xs font-extrabold text-slate-800">${Number(item.qty) || 1}</span>
        <button type="button" data-cart-action="plus" data-index="${index}" aria-label="Agregar una unidad de ${escHtml(item.name)}" class="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-700 font-extrabold touch-btn">+</button>
        <button type="button" data-cart-action="remove" data-index="${index}" aria-label="Quitar ${escHtml(item.name)} del carrito" class="w-7 h-7 rounded-lg text-red-500 hover:bg-red-50 touch-btn"><i class="fa-solid fa-trash-can text-xs"></i></button>
      </div>
    </div>`).join('');

  footer.classList.remove('hidden');
  const total = cartTotal(items);
  document.getElementById('cartTotal').textContent = total > 0
    ? `${formatCOP(total)}${hasUnknownPrice(items) ? ' + por cotizar' : ''}`
    : 'Por coordinar';
}

function openCartModal() {
  const biz = state.selectedBusiness;
  if (!biz) return;
  state.cartBizId = String(biz.id);
  renderCartModal(biz.id);
  const modal = document.getElementById('cartModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

const ORDER_FLOW = ['Recibido', 'En Preparación', 'En Camino', 'Entregado'];
const MY_ORDER_BADGE = {
  'Recibido': 'bg-blue-100 text-blue-700',
  'En Preparación': 'bg-amber-100 text-amber-700',
  'En Camino': 'bg-orange-100 text-orange-700',
  'Entregado': 'bg-green-100 text-green-700',
  'Cancelado': 'bg-red-100 text-red-600'
};

function myOrderTotal(order) {
  const products = Array.isArray(order.products) ? order.products : [];
  if (products.length === 0 || hasUnknownPrice(products)) return 'Por cotizar';
  return formatCOP(cartTotal(products));
}

function myOrderTimeline(estado) {
  if (estado === 'Cancelado') {
    return '<p class="text-[10px] font-bold text-red-500 mt-2">Pedido cancelado</p>';
  }
  const idx = Math.max(ORDER_FLOW.indexOf(estado), 0);
  return `<div class="flex items-start gap-1 mt-2">${ORDER_FLOW.map((s, i) => `
    <div class="flex-1 text-center">
      <div class="h-1.5 rounded-full ${i <= idx ? 'bg-orange-500' : 'bg-slate-200'}"></div>
      <p class="text-[8px] font-bold mt-0.5 ${i <= idx ? 'text-orange-600' : 'text-slate-400'}">${escHtml(s)}</p>
    </div>`).join('')}</div>`;
}

window.openMyOrders = async () => {
  const modal = document.getElementById('myOrdersModal');
  const list = document.getElementById('myOrdersList');
  if (!modal || !list) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  list.innerHTML = '<p class="text-center text-xs text-slate-400 py-6">Cargando pedidos...</p>';
  const res = await API.getMyPurchases();
  if (!res || !res.success) {
    list.innerHTML = '<p class="text-center text-xs text-red-500 py-6">No pudimos cargar tus pedidos.</p>';
    return;
  }
  const orders = res.data || [];
  if (orders.length === 0) {
    list.innerHTML = `<div class="text-center py-8 space-y-2">
      <p class="text-3xl">🛍️</p>
      <p class="text-xs font-extrabold text-slate-700">Aún no tienes pedidos</p>
      <p class="text-[11px] text-slate-500">Cuando pidas a una vitrina, aquí podrás seguir su estado.</p>
    </div>`;
    return;
  }
  list.innerHTML = orders.map(o => {
    const badge = MY_ORDER_BADGE[o.estado] || 'bg-slate-100 text-slate-600';
    const products = Array.isArray(o.products) ? o.products : [];
    const items = products.map(p => {
      const qty = Number(p.qty) || 1;
      return `<li class="flex justify-between gap-2"><span>${escHtml(p.name)} × ${qty}</span><span class="text-slate-500">${p.price ? escHtml(p.price) : ''}</span></li>`;
    }).join('');
    const created = o.createdAt ? new Date(o.createdAt).toLocaleString('es-CO') : '';
    return `
      <div class="border border-slate-200 rounded-xl p-3 space-y-2">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="text-xs font-extrabold text-slate-800">${escHtml(o.businessName || 'Vitrina')}</p>
            <p class="text-[10px] text-slate-400">${escHtml(o.orderId || o.id)} · ${escHtml(created)}</p>
          </div>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${badge}">${escHtml(o.estado || 'Recibido')}</span>
        </div>
        ${myOrderTimeline(o.estado)}
        <ul class="text-[11px] text-slate-600 space-y-0.5">${items}</ul>
        <div class="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100">
          <span class="text-slate-500">Pago: <span class="font-bold text-slate-700">${escHtml(o.paymentMethod || 'Por coordinar')}</span></span>
          <span class="font-extrabold text-slate-800">${myOrderTotal(o)}</span>
        </div>
        ${o.observations ? `<p class="text-[10px] text-slate-500 bg-slate-50 rounded-lg p-2">${escHtml(o.observations)}</p>` : ''}
      </div>`;
  }).join('');
};

window.closeMyOrders = () => {
  const modal = document.getElementById('myOrdersModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
};

window.closeCartModal = () => {
  const modal = document.getElementById('cartModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
};

function continueCartCheckout() {
  const biz = state.selectedBusiness;
  if (!biz || !state.cartBizId) return;
  const items = getCartItems(state.cartBizId);
  if (items.length === 0) return;
  window.closeCartModal();
  openCheckoutFor(biz, items, { fromCart: true });
}

function flashCartButton(btn) {
  if (!btn || btn.dataset.flashing === '1') return;
  const original = btn.innerHTML;
  btn.dataset.flashing = '1';
  btn.innerHTML = '<i class="fa-solid fa-check"></i>';
  window.setTimeout(() => {
    btn.innerHTML = original;
    btn.dataset.flashing = '0';
  }, 900);
}

function showProductCartMsg(text) {
  const el = document.getElementById('productDetailCartMsg');
  if (!el) return;
  el.textContent = text;
  el.className = 'text-[11px] font-bold text-center text-emerald-600';
  el.classList.remove('hidden');
  const viewCartBtn = document.getElementById('productDetailViewCartBtn');
  if (viewCartBtn) viewCartBtn.classList.remove('hidden');
  window.clearTimeout(state.productCartMsgTimer);
  state.productCartMsgTimer = window.setTimeout(() => el.classList.add('hidden'), 2500);
}

// Inicia el pedido de un producto: checkout con identidad o contacto directo si está agotado
function orderProduct(biz, product) {
  if (product.availability === 'agotado') {
    const msg = WhatsAppHelper.buildProductMessage(biz, product);
    openWhatsAppPreview(biz.name, biz.phone, msg);
    return;
  }
  openCheckoutFor(biz, [{ ...product, qty: 1 }]);
}

// Abre el modal de checkout para un pedido de la vitrina.
// Si el comprador aún no ingresó, deja el pedido pendiente y abre UNA vez la entrada.
async function openCheckoutFor(business, products, opts = {}) {
  const profile = API.getStoredResidentProfile();
  if (!profile || !profile.phone || !API.getResidentToken()) {
    state.pendingCheckout = {
      business,
      products: products.map(p => ({ ...p })),
      opts: { ...opts }
    };
    openEntryModal();
    return;
  }

  const preferredPayment = CHECKOUT_PAYMENTS.includes(opts.paymentMethod)
    ? opts.paymentMethod
    : getSavedCheckoutPayment();
  state.checkoutCtx = {
    business,
    products,
    mode: 'guest',
    resident: profile,
    observations: opts.observations ? String(opts.observations).slice(0, 300) : '',
    paymentMethod: preferredPayment,
    fromCart: !!opts.fromCart
  };
  state.pendingCheckout = null;

  // Cantidad editable solo cuando hay un único producto (el carrito llega después)
  const qtyRow = document.getElementById('checkoutQtyRow');
  const qtyInput = document.getElementById('checkoutQty');
  const single = products.length === 1;
  if (qtyRow && qtyInput) {
    qtyRow.classList.toggle('hidden', !single);
    qtyRow.classList.toggle('flex', single);
    qtyInput.value = single ? clampQty(products[0].qty || 1) : 1;
    if (single) products[0].qty = Number(qtyInput.value);
  }
  refreshCheckoutSummary();

  resetCheckoutPanels();
  updateCheckoutForProfile(profile);

  const confirmBtn = document.getElementById('checkoutConfirmBtn');
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = '<i class="fa-brands fa-whatsapp text-lg"></i><span>Continuar por WhatsApp</span>';
  }

  document.getElementById('checkoutError').classList.add('hidden');
  document.getElementById('checkoutModal').classList.remove('hidden');
}

function clampQty(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 99);
}

function refreshCheckoutSummary() {
  const ctx = state.checkoutCtx;
  if (!ctx) return;
  const totalQty = ctx.products.reduce((acc, p) => acc + (Number(p.qty) || 1), 0);
  document.getElementById('checkoutOrderCount').innerText = `${totalQty} unidad${totalQty === 1 ? '' : 'es'}`;
  document.getElementById('checkoutOrderText').innerText =
    `${ctx.business.name} · ${ctx.products.map(p => `${p.name}${Number(p.qty) > 1 ? ` ×${p.qty}` : ''}`).join(', ')}`;
  const total = cartTotal(ctx.products);
  const totalEl = document.getElementById('checkoutOrderTotal');
  if (totalEl) {
    totalEl.textContent = total > 0
      ? `Total: ${formatCOP(total)}${hasUnknownPrice(ctx.products) ? ' + por cotizar' : ''}`
      : '';
    totalEl.classList.toggle('hidden', total <= 0);
  }
}

const CHECKOUT_PAYMENT_KEY = 'vn_checkout_payment_v1';
const CHECKOUT_PAYMENTS = ['Efectivo', 'Transferencia'];

function normalizeCheckoutPayment(value) {
  return CHECKOUT_PAYMENTS.includes(value) ? value : 'Efectivo';
}

function getSavedCheckoutPayment() {
  try {
    return normalizeCheckoutPayment(localStorage.getItem(CHECKOUT_PAYMENT_KEY));
  } catch (error) {
    return 'Efectivo';
  }
}

function saveCheckoutPayment(value) {
  try {
    localStorage.setItem(CHECKOUT_PAYMENT_KEY, normalizeCheckoutPayment(value));
  } catch (error) {
    /* sin acción */
  }
}

function isExternalProfile(profile) {
  return !!profile && (profile.role === 'guard' || !profile.tower || !profile.apartment);
}

function profileManzana(profile) {
  if (!profile) return '';
  if (profile.manzana != null && String(profile.manzana).trim() !== '') return String(profile.manzana).trim();
  const fromTowerId = /^torre-m(\d+)-/i.exec(String(profile.towerId || '').trim());
  if (fromTowerId) return fromTowerId[1];
  const tower = state.towersList.find(t => t.id === profile.towerId || t.name === profile.tower);
  return tower && tower.manzana ? String(tower.manzana) : '';
}

function checkoutLocationPart(value, label) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return new RegExp(`^${label}\\b`, 'i').test(raw) ? raw : `${label} ${raw}`;
}

function checkoutLocation(profile) {
  const manzana = profileManzana(profile);
  return [
    manzana ? checkoutLocationPart(manzana, 'Manzana') : '',
    checkoutLocationPart(profile && profile.tower, 'Torre'),
    checkoutLocationPart(profile && profile.apartment, 'Apto')
  ].filter(Boolean).join(' · ');
}

// Resuelve la torre guardada en el perfil (prefiere towerId para no confundir torres de otra manzana)
function profileTowerValue(prof) {
  if (!prof) return '';
  if (prof.towerId && state.towersList.some(t => t.id === prof.towerId)) return prof.towerId;
  let list = state.towersList;
  if (prof.manzana) {
    const filtered = list.filter(t => String(t.manzana) === String(prof.manzana));
    if (filtered.length > 0) list = filtered;
  }
  const match = list.find(t => t.name === prof.tower || t.id === prof.tower);
  return match ? match.id : (prof.tower || '');
}

function resetCheckoutPanels() {
  const prof = API.getStoredResidentProfile();
  document.getElementById('coLoginPhone').value = prof?.phone?.replace('57', '') || '';
  document.getElementById('coLoginPassword').value = '';
  document.getElementById('coGuestName').value = prof?.fullName || '';
  document.getElementById('coGuestPhone').value = prof?.phone?.replace('57', '') || '';
  const towerSel = document.getElementById('coGuestTower');
  const towerVal = profileTowerValue(prof);
  towerSel.value = [...towerSel.options].some(o => o.value === towerVal) ? towerVal : '';
  document.getElementById('coGuestApt').value = prof?.apartment || '';
  document.getElementById('coGuestBirth').value = prof?.birthDate || '';
  document.getElementById('coGuestDelivery').value = prof?.deliveryAddress || '';
  document.getElementById('coGuestNotes').value = state.checkoutCtx?.observations || '';
  document.getElementById('coGuestPayment').value = normalizeCheckoutPayment(state.checkoutCtx?.paymentMethod || getSavedCheckoutPayment());
  const guestTerms = document.getElementById('coGuestTerms');
  if (guestTerms) guestTerms.checked = false;
}

function updateCheckoutForProfile(profile) {
  const external = isExternalProfile(profile);
  const phone = String(profile?.phone || '').replace(/^57/, '');
  const location = checkoutLocation(profile);

  const guestPanel = document.getElementById('checkoutGuestPanel');
  const loginPanel = document.getElementById('checkoutLoginPanel');
  if (guestPanel) guestPanel.classList.remove('hidden');
  if (loginPanel) loginPanel.classList.add('hidden');

  const addressField = document.getElementById('coGuestAddressField');
  if (addressField) addressField.classList.toggle('hidden', !external);
  const identityFields = document.getElementById('coGuestIdentityFields');
  if (identityFields) identityFields.classList.add('hidden');

  const intro = document.getElementById('coGuestIntro');
  if (intro) {
    intro.textContent = external
      ? 'Indica dónde entregamos tu pedido. El resto de tus datos ya está confirmado.'
      : 'Confirma la cantidad y el pago. Enviamos tu pedido directo por WhatsApp.';
  }

  const identityText = document.getElementById('checkoutIdentityText');
  if (identityText) {
    const name = profile?.fullName || (external ? 'Comprador externo' : 'Vecino de Los Naranjos');
    identityText.textContent = external
      ? `${name} · ${phone}`
      : `${name} · ${phone}${location ? ` · ${location}` : ''}`;
    identityText.classList.remove('hidden');
  }

  const delivery = document.getElementById('coGuestDelivery');
  if (delivery) {
    delivery.value = external ? (profile?.deliveryAddress || '') : '';
  }
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

window.closeEntryModal = () => {
  document.getElementById('entryModal').classList.add('hidden');
  state.pendingCheckout = null;
};
window.openEntryModal = openEntryModal;

function updateEntryRoleUI() {
  const active = 'border-orange-500 bg-orange-50 text-orange-700';
  const inactive = 'border-slate-200 bg-white text-slate-600';
  document.querySelectorAll('.entry-role-btn').forEach(b => {
    b.className = `entry-role-btn py-3 rounded-xl border font-extrabold text-[11px] touch-btn flex flex-col items-center justify-center space-y-1 transition ${b.dataset.role === entrySelectedRole ? active : inactive}`;
  });
  const isGuard = entrySelectedRole === 'guard';
  const locationFields = document.getElementById('entryLocationFields');
  if (locationFields) locationFields.classList.toggle('hidden', isGuard);
  const guardNote = document.getElementById('entryGuardNote');
  if (guardNote) guardNote.classList.toggle('hidden', !isGuard);
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
    entrySelectedRole = ['seller', 'guard'].includes(r.data.role) ? r.data.role : 'buyer';
    updateEntryRoleUI();
    if (r.data.manzana) document.getElementById('entryMz').value = String(r.data.manzana);
    if (r.data.apartment) document.getElementById('entryApt').value = r.data.apartment;
    const mz = r.data.manzana ? String(r.data.manzana) : '';
    if (r.data.tower) {
      ensureTowers(['entryTower'], { manzana: mz, placeholder: '', onlyFromManzana: true });
      const sel = document.getElementById('entryTower');
      if ([...sel.options].some(o => o.value === r.data.tower)) sel.value = r.data.tower;
    }
    const rol = r.data.role === 'seller' ? 'Emprendedor' : (r.data.role === 'guard' ? 'Externo' : 'Comprador');
    const reconocido = r.data.role === 'guard'
      ? `Manzana ${r.data.manzana || '—'} · ${rol}`
      : `Manzana ${r.data.manzana || '—'} · ${r.data.tower || '—'} · Apto ${r.data.apartment || '—'} · ${rol}`;
    document.getElementById('entryRecognitionData').textContent = reconocido;
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
    role = ['seller', 'guard'].includes(entryKnown.role) ? entryKnown.role : 'buyer';
    manzana = entryKnown.manzana;
    tower = entryKnown.tower;
    apartment = entryKnown.apartment;
  } else {
    role = entrySelectedRole;
    manzana = document.getElementById('entryMz').value;
    tower = document.getElementById('entryTower').value;
    apartment = document.getElementById('entryApt').value.trim();
  }
  const isGuard = role === 'guard';

  const digits = phone.replace(/\D/g, '');
  if (!role) {
    errEl.textContent = 'Selecciona si ingresas como Comprador, Vendedor o Externo.';
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
  if (!tower && !isGuard) {
    errEl.textContent = 'Selecciona tu torre.';
    errEl.classList.remove('hidden');
    return;
  }
  if (!apartment && !isGuard) {
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

  mmState.manzana = String(manzana || '3');
  // El guarda de seguridad no accede al contenido privado de "Mi Manzana".
  mmState.mode = role === 'guard' ? 'guest' : 'resident';
  renderMiManzana();

  // Si el ingreso vino desde un pedido, volvemos al mismo checkout (misma cantidad).
  const pending = state.pendingCheckout;
  if (pending) state.pendingCheckout = null;
  if (pending && role !== 'seller') {
    await openCheckoutFor(pending.business, pending.products, pending.opts);
    return;
  }

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
  const open = () => { if (!API.getStoredResidentProfile()) openEntryModal(); };
  const welActive = document.querySelector('.vn-wel') && !localStorage.getItem('vn_bienvenida_vista');
  if (welActive) {
    document.addEventListener('vn:bienvenida:closed', open, { once: true });
    return;
  }
  setTimeout(open, 400);
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
    const val = profileTowerValue(profile);
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

// Confirmar el pedido: usa la identidad ya registrada, crea la orden y abre WhatsApp.
async function handleCheckoutConfirm() {
  const ctx = state.checkoutCtx;
  if (!ctx) return;
  const errEl = document.getElementById('checkoutError');
  errEl.classList.add('hidden');
  errEl.className = 'bg-red-50 border border-red-200 text-red-600 text-xs font-bold p-2.5 rounded-xl';

  let profile = API.getStoredResidentProfile();
  if (!profile || !profile.phone || !API.getResidentToken()) {
    state.pendingCheckout = {
      business: ctx.business,
      products: ctx.products.map(p => ({ ...p })),
      opts: {
        observations: ctx.observations || '',
        paymentMethod: ctx.paymentMethod || getSavedCheckoutPayment(),
        fromCart: !!ctx.fromCart
      }
    };
    document.getElementById('checkoutModal').classList.add('hidden');
    state.checkoutCtx = null;
    openEntryModal();
    return;
  }

  const external = isExternalProfile(profile);
  const deliveryInput = document.getElementById('coGuestDelivery');
  const deliveryAddress = external
    ? String(deliveryInput?.value || '').trim()
    : (checkoutLocation(profile) || profile.deliveryAddress || '');
  const observations = document.getElementById('coGuestNotes').value.trim().slice(0, 300);
  const paymentMethod = normalizeCheckoutPayment(document.getElementById('coGuestPayment').value);

  if (external && !deliveryAddress) {
    errEl.textContent = 'Indica la dirección de entrega de tu pedido.';
    errEl.classList.remove('hidden');
    return;
  }
  if (!deliveryAddress) {
    errEl.textContent = 'No pudimos determinar tu ubicación. Vuelve a ingresar tus datos.';
    errEl.classList.remove('hidden');
    return;
  }

  const confirmBtn = document.getElementById('checkoutConfirmBtn');
  confirmBtn.disabled = true;
  confirmBtn.innerHTML = '<span>Guardando...</span>';

  // Sincronizar la cantidad elegida en el resumen (pedido de un solo producto)
  const qtyInput = document.getElementById('checkoutQty');
  if (ctx.products.length === 1 && qtyInput) {
    ctx.products[0].qty = clampQty(qtyInput.value);
  }
  ctx.observations = observations;
  ctx.paymentMethod = paymentMethod;
  saveCheckoutPayment(paymentMethod);

  if (external) {
    profile = { ...profile, deliveryAddress };
    API.saveStoredResidentProfile(profile);
  }

  const resident = {
    fullName: profile.fullName || null,
    phone: profile.phone,
    tower: external ? null : (profile.tower || null),
    apartment: external ? null : (profile.apartment || null),
    manzana: profileManzana(profile),
    deliveryAddress,
    authType: profile.authType || 'entry'
  };

  // Crear la orden (siempre se registra)
  const orderPayload = {
    businessId: ctx.business.id,
    products: ctx.products.map(p => ({
      id: p.id || null,
      name: p.name,
      price: p.price || null,
      qty: Number(p.qty) || 1
    })),
    observations: observations || null,
    paymentMethod: paymentMethod || null,
    resident
  };
  const created = await API.createOrder(orderPayload);
  if (!created || !created.success) {
    errEl.textContent = (created && created.message) || 'No pudimos registrar el pedido. Intenta de nuevo.';
    errEl.classList.remove('hidden');
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = '<i class="fa-brands fa-whatsapp text-lg"></i><span>Continuar por WhatsApp</span>';
    return;
  }

  saveLastOrder({
    businessId: ctx.business.id,
    businessName: ctx.business.name,
    products: ctx.products.map(p => ({
      id: p.id || null,
      name: p.name,
      price: p.price || null,
      qty: Number(p.qty) || 1
    })),
    observations: observations || '',
    paymentMethod: paymentMethod || 'Efectivo',
    orderId: (created.data && created.data.orderId) || '',
    createdAt: new Date().toISOString()
  });
  if (ctx.fromCart) clearCart(ctx.business.id);
  updateRepeatOrderBar(ctx.business.id);

  // Abrir WhatsApp con los datos de identidad y el producto
  document.getElementById('checkoutModal').classList.add('hidden');
  const msg = buildOrderMessage(ctx, resident);
  openWhatsAppPreview(ctx.business.name, ctx.business.phone, msg);
  state.checkoutCtx = null;
}

// Construye el mensaje de WhatsApp del pedido con datos del residente.
// Para vecinos usa siempre la ubicación completa; para externos, la dirección.
function buildOrderMessage(ctx, resident) {
  const external = !resident.tower || !resident.apartment;
  const location = external ? '' : checkoutLocation(resident);
  const who = resident.fullName || (external ? 'un visitante' : 'un vecino');
  const greeting = external
    ? `Hola *${ctx.business.name}*, soy ${who}.`
    : `Hola *${ctx.business.name}*, soy ${who}, de Los Naranjos${location ? ` (${location})` : ''}.`;
  const lines = [
    greeting,
    '',
    'Quisiera pedir:'
  ];
  ctx.products.forEach(p => {
    const qty = Number(p.qty) || 1;
    lines.push(`• ${p.name} ×${qty}${p.price ? ` — ${p.price}` : ''}`);
  });
  const total = cartTotal(ctx.products);
  if (total > 0) {
    lines.push(`Total: ${formatCOP(total)}${hasUnknownPrice(ctx.products) ? ' + productos por cotizar' : ''}`);
  }
  lines.push('');
  if (ctx.observations) lines.push(`Observaciones: ${ctx.observations}`);
  lines.push(`Dirección de entrega: ${external ? (resident.deliveryAddress || 'Por coordinar') : location}`);
  if (ctx.paymentMethod) lines.push(`Forma de pago: ${ctx.paymentMethod}`);
  lines.push('');
  lines.push(`Mi teléfono: ${resident.phone}`);
  const withId = ctx.products.find(p => p.id);
  if (withId) {
    lines.push(`Producto: ${window.location.origin}/p/${encodeURIComponent(withId.id)}`);
  }
  return lines.join('\n');
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
  let scrollY = 0;
  const sync = () => {
    const anyOpen = Array.from(modals).some((el) => !el.classList.contains('hidden'));
    const locked = document.body.classList.contains('modal-open');
    if (anyOpen && !locked) {
      scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
    }
    document.body.classList.toggle('modal-open', anyOpen);
    if (!anyOpen && locked) {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
    }
  };
  modals.forEach((el) => new MutationObserver(sync).observe(el, { attributes: true, attributeFilter: ['class'] }));
  sync();
}
