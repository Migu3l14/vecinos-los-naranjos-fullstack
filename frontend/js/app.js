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
  announcements: [],
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
  await loadInitialData();
});

// Cargar datos desde la API REST
async function loadInitialData() {
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
}

// Verifica en el servidor que la sesión guardada siga siendo válida.
// Si el token expiró, la limpia para evitar pantallas rotas.
async function verifySession() {
  const hasToken = API.hasAnySession();
  if (!hasToken) return;
  const me = await API.getMe();
  if (!me) {
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

  // Botón abrir modal de gestión / renovación
  const openManageBtn = document.getElementById('openManageModalBtn');
  if (openManageBtn) {
    openManageBtn.addEventListener('click', () => {
      document.getElementById('managePhoneInput').value = '';
      document.getElementById('manageResultSection').classList.add('hidden');
      document.getElementById('manageModal').classList.remove('hidden');
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
}

// ==========================================
// FILTROS Y NAVEGACIÓN DEL DIRECTORIO
// ==========================================
// Filtros del directorio + comunicados oficiales de la manzana activa
async function fetchFilteredBusinesses() {
  const params = {};
  if (state.currentCategory !== 'all') params.category = state.currentCategory;
  if (state.currentManzana !== 'all') params.manzana = state.currentManzana;
  if (state.currentSearch.trim() !== '') params.q = state.currentSearch;

  const manzana = state.currentManzana;
  const [filtered, anns] = await Promise.all([
    API.getBusinesses(params),
    (manzana && manzana !== 'all') ? API.getAnnouncements(manzana) : Promise.resolve([])
  ]);

  state.businesses = filtered;
  state.announcements = anns || [];

  UI.renderAnnStories(state.announcements, manzana, openAnnStory);
  renderBusinessList();
}

// Renderiza el listado intercalando tarjetas promocionales cuando hay comunicados
function renderBusinessList() {
  if (state.announcements.length) {
    UI.renderBusinessesWithPromos(state.businesses, state.announcements, handleOpenProfile, handleQuickWhatsApp, openAnnStory, 4);
  } else {
    UI.renderBusinesses(state.businesses, handleOpenProfile, handleQuickWhatsApp);
  }
}

// Abre el comunicado como historia a pantalla completa
function openAnnStory(id) {
  const ann = state.announcements.find(a => a.id === id) || null;
  if (!ann) return;
  UI.renderAnnStoryModal(ann);
  document.getElementById('annStoryModal').classList.remove('hidden');
}

window.closeAnnStory = () => document.getElementById('annStoryModal').classList.add('hidden');

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
              <img src="${prod.photo}" alt="${escHtml(prod.name)}" class="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-slate-200" onerror="this.style.display='none'"/>
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
              ${agotado ? '' : `<button data-prodbuy="${i}" data-cat="${escHtml(cat)}" class="prod-buy-btn px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold rounded-lg shadow">
                <i class="fa-solid fa-cart-shopping mr-1"></i>Comprar / Reservar
              </button>`}
            </div>
          </div>`;
      });
      productsHtml += `</div></div>`;
    });
  }
  productsContainer.innerHTML = productsHtml;
  renderRatingWidget(biz);

  productsContainer.querySelectorAll('[data-prodwa]').forEach(btn => {
    btn.addEventListener('click', () => {
      const prod = prods[Number(btn.dataset.prodwa)];
      document.getElementById('profileModal').classList.add('hidden');
      const msg = WhatsAppHelper.buildProductMessage(biz, { name: prod.name });
      openWhatsAppPreview(biz.name, biz.phone, msg);
    });
  });

  productsContainer.querySelectorAll('[data-prodbuy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const prod = prods[Number(btn.dataset.prodbuy)];
      document.getElementById('profileModal').classList.add('hidden');
      openCheckoutFor(biz, [{ name: prod.name, price: prod.price, qty: 1, category: prod.category }]);
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

// Carga la lista de torres en los selects indicados
async function ensureTowers(selectIds) {
  if (!state.towersList || state.towersList.length === 0) {
    const cfg = await API.getTowers();
    state.towersList = (cfg && cfg.towers) ? cfg.towers : [];
  }
  selectIds.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = state.towersList.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
    if (current && [...sel.options].some(o => o.value === current)) sel.value = current;
  });
}

// Abre el modal de checkout dual para un pedido concreto
async function openCheckoutFor(business, products) {
  state.checkoutCtx = { business, products, mode: 'login', resident: null };

  // Resumen del pedido
  const totalQty = products.reduce((a, p) => a + (p.qty || 1), 0);
  document.getElementById('checkoutOrderCount').innerText = `${products.length} producto${products.length === 1 ? '' : 's'}`;
  document.getElementById('checkoutOrderText').innerText =
    `${business.name} · ${products.map(p => `${p.name}${p.qty > 1 ? ` ×${p.qty}` : ''}`).join(', ')}`;

  // Precargar torres
  await ensureTowers(['coGuestTower']);

  // Autocompletar si el residente ya se identificó antes (perfil guardado)
  const existing = API.getStoredResidentProfile();
  if (existing) {
    document.getElementById('coGuestName').value = existing.fullName || '';
    document.getElementById('coGuestPhone').value = (existing.phone || '').replace('57', '');
    if (existing.tower) {
      const sel = document.getElementById('coGuestTower');
      if ([...sel.options].some(o => o.value === existing.tower)) sel.value = existing.tower;
    }
    document.getElementById('coGuestApt').value = existing.apartment || '';
    document.getElementById('coGuestBirth').value = existing.birthDate || '';
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
    if ([...sel.options].some(o => o.value === profile.tower)) sel.value = profile.tower;
  }
  document.getElementById('coGuestApt').value = profile.apartment || '';
  document.getElementById('coGuestName').value = profile.fullName || '';
  document.getElementById('coGuestPhone').value = (profile.phone || '').replace('57', '');
  document.getElementById('coGuestBirth').value = profile.birthDate || '';

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

  if (!fullName || !phone || !tower || !apartment || !birthDate) {
    errEl.textContent = 'Completa nombre, teléfono, torre, apartamento y fecha de nacimiento.';
    errEl.classList.remove('hidden');
    return;
  }

  const confirmBtn = document.getElementById('checkoutConfirmBtn');
  confirmBtn.disabled = true;
  confirmBtn.innerHTML = '<span>Guardando...</span>';

  // Registrar/actualizar la identidad como vecino (guest checkout usa los datos del formulario,
  // que ya vienen autocompletados tras el login del residente cuando aplica)
  const guestData = { fullName, phone, tower, apartment, birthDate };
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
  return `Hola, soy ${resident.fullName}, vecino de Los Naranjos (Torre ${resident.tower}, Apartamento ${resident.apartment}).\n\nQuisiera pedir de tu vitrina:\n• ${products}\n\nMi teléfono: ${resident.phone}`;
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
