// Panel del Vendedor — gestión de la propia vitrina y sus productos
import { API } from './api.js';
import { setupImageUpload, resetImageUpload } from './upload.js';

const state = {
  business: null,
  categories: []
};

function $(id) { return document.getElementById(id); }
function show(...ids) {
  ids.forEach(id => {
    const el = $(id);
    if (el) el.classList.remove('hidden');
  });
}
function hide(...ids) {
  ids.forEach(id => {
    const el = $(id);
    if (el) el.classList.add('hidden');
  });
}
function showMsg(msg, ok = true) {
  const targets = [$('mvProductMsg'), $('mvProfileMsg')].filter(Boolean);
  targets.forEach(t => {
    t.classList.remove('hidden', 'bg-green-50', 'border-green-200', 'text-green-700');
    if (!msg) {
      t.classList.add('hidden');
      return;
    }
    t.className = `my-3 ${ok ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-600'} text-xs font-bold p-2.5 rounded-xl`;
    t.textContent = msg;
  });
}

// ---------- Flujo de verificación por código (OTP) ----------
let otpTimer = null;
let otpExpiresAt = 0;
let otpPhone = '';

function showLoginError(msg) {
  const el = $('mvLoginError');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function showOtpError(msg) {
  const el = $('mvOtpError');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearOtpBoxes() {
  document.querySelectorAll('.mv-otp-digit').forEach(inp => { inp.value = ''; });
}

function getOtpBoxCode() {
  return Array.from(document.querySelectorAll('.mv-otp-digit')).map(i => i.value).join('');
}

function focusFirstEmptyDigit() {
  const box = Array.from(document.querySelectorAll('.mv-otp-digit')).find(i => !i.value);
  if (box) box.focus();
}

let resendTimer = null;
function scheduleResend(secondsLeft) {
  updateResendInfo(secondsLeft);
  if (resendTimer) clearInterval(resendTimer);
  resendTimer = setInterval(() => {
    secondsLeft -= 1;
    updateResendInfo(secondsLeft);
    if (secondsLeft <= 0) {
      clearInterval(resendTimer);
      resendTimer = null;
      $('mvResendBtn').disabled = false;
      $('mvResendInfo').textContent = '';
    }
  }, 1000);
}

function updateResendInfo(s) {
  $('mvResendBtn').disabled = s > 0;
  $('mvResendInfo').textContent = s > 0 ? `Reenviar en ${s}s` : '';
}

function stopOtpCountdown() {
  if (otpTimer) { clearInterval(otpTimer); otpTimer = null; }
}

function renderOtpCountdown() {
  const remain = Math.max(0, Math.floor((otpExpiresAt - Date.now()) / 1000));
  const min = Math.floor(remain / 60);
  const sec = String(remain % 60).padStart(2, '0');
  $('mvOtpCountdown').textContent = `${min}:${sec}`;
  if (remain <= 0) {
    $('mvOtpCodeValue').textContent = '—';
    $('mvOtpBanner').classList.add('opacity-60');
    showOtpError('El código expiró. Solicita uno nuevo.');
    stopOtpCountdown();
  }
}

function startOtpCountdown() {
  stopOtpCountdown();
  otpTimer = setInterval(renderOtpCountdown, 1000);
  renderOtpCountdown();
}

async function requestOtpCode() {
  const phone = $('mvLoginPhone').value.trim();
  $('mvLoginError').classList.add('hidden');
  $('mvOtpError').classList.add('hidden');
  if (!phone) {
    showLoginError('Ingresa tu número de teléfono.');
    return;
  }
  $('mvGetCodeBtn').disabled = true;
  $('mvGetCodeBtn').innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Enviando...';
  const res = await API.requestOtp(phone);
  $('mvGetCodeBtn').disabled = false;
  $('mvGetCodeBtn').innerHTML = '<i class="fa-solid fa-paper-plane mr-1"></i> Enviar código';
  if (!res.success) {
    showLoginError(res.message || 'No se pudo enviar el código.');
    return;
  }

  otpPhone = phone;
  otpExpiresAt = Date.now() + (res.data.expiresInSeconds || 300) * 1000;

  // Muestra el código generado en el aviso verde de la parte superior
  $('mvOtpCodeValue').textContent = res.data.code;
  $('mvOtpBanner').classList.remove('opacity-60', 'hidden');
  $('mvLoginError').classList.add('hidden');
  show('mvOtpStep');
  hide('mvPhoneStep');
  clearOtpBoxes();
  startOtpCountdown();
  focusFirstEmptyDigit();
  scheduleResend(60);
}

async function verifyOtpBoxes() {
  const code = getOtpBoxCode();
  $('mvOtpError').classList.add('hidden');
  if (!/^\d{4}$/.test(code)) {
    showOtpError('Ingresa el código de 4 dígitos completo.');
    return;
  }
  $('mvVerifyBtn').disabled = true;
  const res = await API.verifyOtp(otpPhone, code);
  $('mvVerifyBtn').disabled = false;
  if (res.success) {
    stopOtpCountdown();
    $('mvOtpBanner').classList.add('hidden');
    await initAuth();
  } else {
    showOtpError(res.message || 'Código inválido.');
    clearOtpBoxes();
    focusFirstEmptyDigit();
  }
}

function resetToPhoneStep() {
  stopOtpCountdown();
  if (resendTimer) { clearInterval(resendTimer); resendTimer = null; }
  $('mvOtpBanner').classList.add('hidden');
  $('mvOtpError').classList.add('hidden');
  $('mvLoginError').classList.add('hidden');
  hide('mvOtpStep');
  show('mvPhoneStep');
  clearOtpBoxes();
  $('mvResendBtn').disabled = false;
  $('mvResendInfo').textContent = '';
  const phone = $('mvLoginPhone');
  if (phone) phone.focus();
}

async function loadCategories() {
  try {
    state.categories = await API.getCategories();
  } catch (e) {
    state.categories = [];
  }
  const sel = $('mvCategory');
  if (!sel) return;
  sel.innerHTML = '';
  (state.categories.length ? state.categories : ['General']).forEach(c => {
    const opt = document.createElement('option');
    opt.value = typeof c === 'string' ? c : (c.name || c.id || 'General');
    opt.textContent = typeof c === 'string' ? c : (c.name || c.id || 'General');
    sel.appendChild(opt);
  });
}

async function loadMyBusiness() {
  const mine = await API.getMyBusinesses();
  if (mine && mine.length > 0) {
    state.business = mine[0];
    renderDashboard();
  } else {
    show('mvNoBizView');
    hide('mvDashView');
  }
}

function renderDashboard() {
  const biz = state.business;
  show('mvDashView', 'mvLogoutBtn');
  hide('mvLoginView', 'mvNoBizView');

  // Perfil
  $('mvName').value = biz.name || '';
  if ([...$('mvCategory').options].some(o => o.value === biz.category)) {
    $('mvCategory').value = biz.category || 'General';
  }
  $('mvManzana').value = String(biz.manzana || '1');
  $('mvPhone').value = (biz.phone || '').replace(/^57/, '');
  resetImageUpload('mvCover');
  if (biz.coverImage) {
    $('mvCover_url').value = biz.coverImage;
    $('mvCover_img').src = biz.coverImage;
    $('mvCover_preview').classList.remove('hidden');
  }
  $('mvShortDesc').value = biz.shortDesc || '';
  $('mvFullDesc').value = biz.fullDesc || '';
  $('mvHours').value = biz.hours || '';
  $('mvDelivery').value = biz.delivery || '';
  $('mvInstagram').value = biz.instagram || '';
  $('mvFacebook').value = biz.facebook || '';

  // Estado
  const st = biz.status;
  let stText;
  if (st === 'active') {
    const trial = (biz.trialEndsAt || biz.trialUsed) ? ' (mes gratis)' : '';
    stText = `Vitrina activa${trial} · ${biz.daysRemaining || 0} días restantes`;
  } else if (st === 'pending_payment') {
    stText = 'Activando tu vitrina...';
  } else if (st === 'paused') {
    stText = biz.pausedReason || 'Vitrina pausada';
  } else {
    stText = `Estado: ${st}`;
  }
  $('mvStatusText').textContent = stText;
  $('mvViewLink').href = `./index.html`;

  renderProducts();
  switchPanel('perfil');
}

function renderProducts() {
  const list = $('mvProductsList');
  list.innerHTML = '';
  const products = state.business.products || [];
  if (products.length === 0) {
    list.innerHTML = '<p class="text-center text-xs text-slate-400 py-6">Aún no tienes productos. Agrega el primero.</p>';
    return;
  }
  products.forEach(p => {
    const agotado = p.availability === 'agotado';
    const card = document.createElement('div');
    card.className = 'flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-3';
    card.innerHTML = `
      <img src="${p.photo || 'https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=100&q=80'}" alt="" class="w-14 h-14 rounded-lg object-contain bg-slate-100" onerror="this.style.display='none'"/>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <p class="text-sm font-extrabold truncate">${esc(p.name)}</p>
          ${agotado ? '<span class="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Agotado</span>' : '<span class="text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Activo</span>'}
        </div>
        <p class="text-xs text-slate-500 truncate">${esc(p.category || 'General')} · ${esc(p.price || '')}</p>
        ${p.description ? `<p class="text-[11px] text-slate-400 truncate">${esc(p.description)}</p>` : ''}
      </div>
      <div class="flex flex-col gap-1">
        <button data-act="edit" data-pid="${esc(p.id)}" class="text-orange-600 hover:bg-orange-50 w-8 h-8 rounded-lg flex items-center justify-center"><i class="fa-solid fa-pen"></i></button>
        <button data-act="del" data-pid="${esc(p.id)}" class="text-red-500 hover:bg-red-50 w-8 h-8 rounded-lg flex items-center justify-center"><i class="fa-solid fa-trash"></i></button>
      </div>
    `;
    list.appendChild(card);
  });
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function switchPanel(name) {
  document.querySelectorAll('.mvt-tab').forEach(t => {
    const active = t.dataset.mvtPanel === name;
    t.className = 'mvt-tab py-3 text-xs font-extrabold border-b-2 ' + (active ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500');
  });
  if (name === 'perfil') {
    show('mvtPerfil');
    hide('mvtProductos', 'mvtOfertas');
  } else if (name === 'productos') {
    show('mvtProductos');
    hide('mvtPerfil', 'mvtOfertas');
  } else {
    show('mvtOfertas');
    hide('mvtPerfil', 'mvtProductos');
    renderOffersList();
  }
  if ($('mvOfferForm')) $('mvOfferForm').classList.add('hidden');
  showMsg(null, true);
  showOfferMsg(null, true);
}

// ---------- Sub-vista OFERTAS ----------
async function renderOffersList() {
  const list = $('mvOffersList');
  if (!list) return;
  list.innerHTML = '<p class="text-center text-xs text-slate-400 py-4">Cargando ofertas...</p>';
  const res = await API.getMyOffers();
  const offers = res && res.success ? res.data : [];
  if (offers.length === 0) {
    list.innerHTML = '<p class="text-center text-xs text-slate-400 py-6">Aún no has publicado ofertas. Publica la primera para aparecer en el carrusel del día.</p>';
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  list.innerHTML = offers.map(off => {
    const isToday = off.date === today;
    const isActive = off.status === 'active';
    return `
      <div data-id="${off.id}" class="bg-white border border-slate-200 rounded-xl p-3">
        <div class="flex gap-3">
          <img src="${esc(off.image || '')}" alt="" class="w-14 h-14 rounded-lg object-contain bg-slate-100 flex-shrink-0" onerror="this.style.display='none'" />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-extrabold text-slate-800 leading-tight line-clamp-1">${esc(off.title)}</p>
            <p class="text-[11px] text-slate-500 mt-0.5 truncate">${esc(off.price || '')}${off.oldPrice ? ' · <s>' + esc(off.oldPrice) + '</s>' : ''}</p>
            <p class="text-[10px] text-slate-400 mt-0.5">📅 ${esc(off.date)}${isToday ? ' · Hoy' : ''}</p>
          </div>
        </div>
        <div class="flex items-center gap-1.5 mt-2">
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full flex-1 text-center ${isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}">${isActive ? 'Activa' : 'Inactiva'}</span>
          <button data-oact="edit" data-oid="${esc(off.id)}" class="px-3 py-1.5 text-orange-600 hover:bg-orange-50 text-[11px] font-bold rounded-lg border border-orange-200">Editar</button>
          <button data-oact="toggle" data-oid="${esc(off.id)}" data-status="${isActive ? 'inactive' : 'active'}" class="px-3 py-1.5 text-slate-600 hover:bg-slate-50 text-[11px] font-bold rounded-lg border border-slate-200">${isActive ? 'Desactivar' : 'Activar'}</button>
          <button data-oact="delete" data-oid="${esc(off.id)}" class="px-3 py-1.5 text-red-600 hover:bg-red-50 text-[11px] font-bold rounded-lg border border-red-200"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`;
  }).join('');
}

function openOfferForm(offer) {
  $('mvoId').value = offer ? offer.id : '';
  $('mvoTitle').value = offer ? offer.title : '';
  $('mvoPrice').value = offer ? (offer.price || '') : '';
  $('mvoOldPrice').value = offer ? (offer.oldPrice || '') : '';
  $('mvoDesc').value = offer ? (offer.desc || '') : '';
  $('mvoDate').value = offer ? offer.date : new Date().toISOString().slice(0, 10);
  $('mvoStatus').value = offer ? (offer.status || 'active') : 'active';
  resetImageUpload('mvoImage');
  if (offer && offer.image) {
    $('mvoImage_url').value = offer.image;
    $('mvoImage_img').src = offer.image;
    $('mvoImage_preview').classList.remove('hidden');
  }
  $('mvOfferFormTitle').textContent = offer ? 'Editar oferta' : 'Nueva oferta';
  $('mvOfferForm').classList.remove('hidden');
  $('mvOfferForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showOfferMsg(msg, ok) {
  const el = $('mvOfferMsg');
  if (!msg) {
    el.classList.add('hidden');
    return;
  }
  el.className = `${ok ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-600'} text-xs font-bold p-2.5 rounded-xl`;
  el.classList.remove('hidden');
  el.textContent = msg;
  if (ok) setTimeout(() => el.classList.add('hidden'), 3500);
}

async function saveOffer() {
  const id = $('mvoId').value;
  const payload = {
    bizId: state.business && state.business.id,
    title: $('mvoTitle').value.trim(),
    price: $('mvoPrice').value.trim(),
    oldPrice: $('mvoOldPrice').value.trim(),
    desc: $('mvoDesc').value.trim(),
    date: $('mvoDate').value,
    status: $('mvoStatus').value,
    image: $('mvoImage_url').value.trim()
  };
  if (!payload.bizId || !payload.title || !payload.date) {
    showOfferMsg('Completa la vitrina, el título y la fecha.', false);
    return;
  }
  const res = id ? await API.updateOffer(id, payload) : await API.createOffer(payload);
  if (res.success) {
    showOfferMsg(id ? 'Oferta actualizada.' : 'Oferta publicada.', true);
    $('mvOfferForm').classList.add('hidden');
    await renderOffersList();
  } else {
    showOfferMsg(res.message || 'No se pudo guardar la oferta.', false);
  }
}

async function deleteOfferAction(oid) {
  if (!confirm('¿Eliminar esta oferta?')) return;
  const res = await API.deleteOffer(oid);
  if (res.success) {
    showOfferMsg('Oferta eliminada.', true);
    await renderOffersList();
  } else {
    alert(res.message || 'No se pudo eliminar la oferta.');
  }
}

async function toggleOfferStatusAction(oid, status) {
  const res = await API.toggleOfferStatus(oid, status);
  if (res.success) {
    showOfferMsg(res.message || 'Estado actualizado.', true);
    await renderOffersList();
  } else {
    alert(res.message || 'No se pudo cambiar el estado.');
  }
}

function openProductForm(product) {
  $('mvProductForm').classList.remove('hidden');
  $('mvProductFormTitle').textContent = product ? 'Editar producto' : 'Nuevo producto';
  $('mvProductId').value = product ? product.id : '';
  $('mvpName').value = product ? product.name : '';
  $('mvpDescription').value = product ? product.description : '';
  resetImageUpload('mvpPhoto');
  if (product && product.photo) {
    $('mvpPhoto_url').value = product.photo;
    $('mvpPhoto_img').src = product.photo;
    $('mvpPhoto_preview').classList.remove('hidden');
  }
  $('mvpPrice').value = product ? product.price : '';
  $('mvpCategory').value = product ? product.category : '';
  $('mvpAvailability').value = product ? product.availability : 'activo';
  $('mvProductForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function saveProfile() {
  const payload = {
    name: $('mvName').value.trim(),
    category: $('mvCategory').value,
    manzana: $('mvManzana').value,
    phone: $('mvPhone').value.trim(),
    coverImage: $('mvCover_url').value.trim(),
    shortDesc: $('mvShortDesc').value.trim(),
    fullDesc: $('mvFullDesc').value.trim(),
    hours: $('mvHours').value.trim(),
    delivery: $('mvDelivery').value.trim(),
    instagram: $('mvInstagram').value.trim(),
    facebook: $('mvFacebook').value.trim()
  };
  if (!payload.name || !payload.phone) {
    showMsg('Nombre y WhatsApp son requeridos.', false);
    return;
  }
  const res = await API.updateMyBusiness(state.business.id, payload);
  if (res.success) {
    state.business = res.data;
    // Si cambió el número, se refleja también en la sesión/dispositivo del dueño.
    const savedPhone = res.data && res.data.phone;
    if (savedPhone) {
      const prof = API.getStoredResidentProfile();
      if (prof) {
        prof.phone = savedPhone;
        API.saveStoredResidentProfile(prof);
      }
      const sessionPhoneEl = $('mvSessionPhone');
      if (sessionPhoneEl) sessionPhoneEl.textContent = String(savedPhone).replace(/^57/, '');
    }
    showMsg('Perfil actualizado correctamente.', true);
  } else {
    showMsg(res.message || 'No se pudo guardar.', false);
  }
}

async function saveProduct() {
  const businessId = state.business.id;
  const pid = $('mvProductId').value;
  const payload = {
    name: $('mvpName').value.trim(),
    description: $('mvpDescription').value.trim(),
    photo: $('mvpPhoto_url').value.trim(),
    price: $('mvpPrice').value.trim(),
    category: $('mvpCategory').value.trim() || 'General',
    availability: $('mvpAvailability').value
  };
  if (!payload.name || !payload.price) {
    showMsg('Nombre y precio del producto son requeridos.', false);
    return;
  }
  const res = pid ? await API.updateMyProduct(businessId, pid, payload) : await API.addMyProduct(businessId, payload);
  if (res.success) {
    showMsg('Producto guardado correctamente.', true);
    $('mvProductForm').classList.add('hidden');
    await loadMyBusiness();
  } else {
    showMsg(res.message || 'No se pudo guardar el producto.', false);
  }
}

async function deleteProduct(pid) {
  if (!confirm('¿Eliminar este producto?')) return;
  const res = await API.deleteMyProduct(state.business.id, pid);
  if (res.success) {
    showMsg('Producto eliminado.', true);
    await loadMyBusiness();
  } else {
    showMsg(res.message || 'No se pudo eliminar.', false);
  }
}

function bindEvents() {
  $('mvLogoutBtn').addEventListener('click', async () => {
    API.logoutResident();
    await initAuth();
  });

  $('mvGetCodeBtn').addEventListener('click', requestOtpCode);
  $('mvLoginPhone').addEventListener('keydown', e => { if (e.key === 'Enter') requestOtpCode(); });
  $('mvVerifyBtn').addEventListener('click', verifyOtpBoxes);
  $('mvResendBtn').addEventListener('click', () => {
    $('mvOtpError').classList.add('hidden');
    requestOtpCode();
  });
  $('mvChangePhoneBtn').addEventListener('click', resetToPhoneStep);
  $('mvOtpBannerClose').addEventListener('click', () => $('mvOtpBanner').classList.add('hidden'));

  // Casillas del código: avanzar/borrar y verificar al completar las 4
  document.querySelectorAll('.mv-otp-digit').forEach(input => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '');
      const next = input.nextElementSibling;
      if (input.value && next && next.classList.contains('mv-otp-digit')) next.focus();
      if (getOtpBoxCode().length === 4) {
        document.querySelector('.mv-otp-digit[data-digit="4"]').blur();
        setTimeout(verifyOtpBoxes, 300);
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value) {
        const prev = input.previousElementSibling;
        if (prev && prev.classList.contains('mv-otp-digit')) {
          prev.focus();
          prev.value = '';
        }
      }
    });
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 4);
      const boxes = document.querySelectorAll('.mv-otp-digit');
      boxes.forEach((b, i) => { b.value = pasted[i] || ''; });
      const last = document.querySelector('.mv-otp-digit[data-digit="4"]');
      if (pasted.length === 4) {
        last.blur();
        setTimeout(verifyOtpBoxes, 300);
      } else {
        focusFirstEmptyDigit();
      }
    });
  });

  $('mvSaveProfileBtn').addEventListener('click', saveProfile);
  $('mvAddProductBtn').addEventListener('click', () => openProductForm(null));
  $('mvpCancelBtn').addEventListener('click', () => $('mvProductForm').classList.add('hidden'));
  $('mvpSaveBtn').addEventListener('click', saveProduct);

  $('mvAddOfferBtn').addEventListener('click', () => openOfferForm(null));
  $('mvoCancelBtn').addEventListener('click', () => $('mvOfferForm').classList.add('hidden'));
  $('mvoSaveBtn').addEventListener('click', saveOffer);

  document.querySelectorAll('.mvt-tab').forEach(t => {
    t.addEventListener('click', () => switchPanel(t.dataset.mvtPanel));
  });

  $('mvProductsList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const pid = btn.dataset.pid;
    if (btn.dataset.act === 'edit') {
      const product = (state.business.products || []).find(p => String(p.id) === String(pid));
      if (product) openProductForm(product);
    } else if (btn.dataset.act === 'del') {
      deleteProduct(pid);
    }
  });

  $('mvOffersList').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-oact]');
    if (!btn) return;
    const oid = btn.dataset.oid;
    const act = btn.dataset.oact;
    if (act === 'edit') {
      const res = await API.getMyOffers();
      const offer = (res && res.success ? res.data : []).find(o => String(o.id) === String(oid));
      if (offer) openOfferForm(offer);
    } else if (act === 'toggle') {
      toggleOfferStatusAction(oid, btn.dataset.status);
    } else if (act === 'delete') {
      deleteOfferAction(oid);
    }
  });
}

async function initAuth() {
  const loggedIn = API.isResidentLoggedIn();
  if (!loggedIn) {
    $('mvOtpBanner').classList.add('hidden');
    stopOtpCountdown();
    if (resendTimer) { clearInterval(resendTimer); resendTimer = null; }
    show('mvLoginView');
    hide('mvDashView', 'mvNoBizView', 'mvLogoutBtn');
    hide('mvOtpStep');
    show('mvPhoneStep');
    return;
  }
  const profile = API.getStoredResidentProfile();
  if (profile && profile.phone) {
    $('mvSessionPhone').textContent = profile.phone.replace(/^57/, '');
  }
  await loadCategories();
  await loadMyBusiness();
}

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  setupImageUpload('mvCover');
  setupImageUpload('mvpPhoto');
  setupImageUpload('mvoImage');
  initAuth();
});
