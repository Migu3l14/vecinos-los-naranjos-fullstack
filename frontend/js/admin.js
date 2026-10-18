// Panel de Administración — PQRS, Pedidos y Vitrinas
import { API } from './api.js';

const $ = (id) => document.getElementById(id);
const showErr = (el, msg) => { el.textContent = msg; el.classList.remove('hidden'); };
const hideErr = (el) => el.classList.add('hidden');

// ---------- LOGIN (teléfono de administración + OTP) ----------
let adminOtpTimer = null;
let adminOtpExpiresAt = 0;

const adminPhoneClean = () => $('admPhone').value.trim().replace(/\D/g, '');

async function handleAdminSendCode() {
  const phone = adminPhoneClean();
  const err = $('admLoginError');
  if (!phone) {
    showErr(err, 'Ingresa el número de administración.');
    return;
  }
  hideErr(err);
  const res = await API.requestAdminOtp(phone);
  if (res.success) {
    $('admOtpSection').classList.remove('hidden');
    $('admSendCodeBtn').disabled = true;
    adminOtpExpiresAt = Date.now() + (res.data.expiresInSeconds || 120) * 1000;
    setAdminOtpTimerLabel();
    adminOtpTimer = setInterval(setAdminOtpTimerLabel, 1000);
    buildAdminOtpBoxes();
    $('admPhone').disabled = true;
    const hint = $('admDemoCodeHint');
    if (hint) {
      if (res.data.code) {
        hint.textContent = `Código de demostración: ${res.data.code}`;
        hint.classList.remove('hidden');
      } else {
        hint.classList.add('hidden');
      }
    }
  } else {
    showErr(err, res.message || 'No se pudo enviar el código.');
  }
}

function buildAdminOtpBoxes() {
  const box = $('admOtpBoxes');
  box.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.maxLength = 1;
    input.className = 'w-12 h-14 text-center text-lg font-extrabold border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:outline-none';
    input.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '');
      if (e.target.value && i < 3) box.children[i + 1].focus();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && i > 0) box.children[i - 1].focus();
    });
    box.appendChild(input);
  }
  box.children[0].focus();
}

function setAdminOtpTimerLabel() {
  const timer = $('admResendTimer');
  const left = Math.max(0, Math.ceil((adminOtpExpiresAt - Date.now()) / 1000));
  if (timer) timer.textContent = `Reintento en ${left}s`;
  if (left === 0 && adminOtpTimer) {
    clearInterval(adminOtpTimer);
    adminOtpTimer = null;
    $('admSendCodeBtn').disabled = false;
    $('admPhone').disabled = false;
    if (timer) timer.textContent = '';
  }
}

async function handleAdminVerify() {
  const err = $('admLoginError');
  const boxes = $('admOtpBoxes').children;
  const code = Array.from(boxes).map(b => b.value).join('');
  if (code.length !== 4) {
    showErr(err, 'Ingresa el código de 4 dígitos.');
    return;
  }
  hideErr(err);
  const res = await API.verifyAdminOtp(adminPhoneClean(), code);
  if (res.success) {
    if (adminOtpTimer) clearInterval(adminOtpTimer);
    adminOtpTimer = null;
    enterPanel(res.data);
  } else {
    showErr(err, res.message || 'Código incorrecto.');
  }
}

function enterPanel(adminData) {
  $('adminLoginView').classList.add('hidden');
  $('adminPanelView').classList.remove('hidden');
  const scope = (adminData && adminData.scope) || API.getAdminScope();
  const isSuper = scope === 'super';
  const manzana = (adminData && adminData.manzana) || localStorage.getItem('adminManzana') || '';
  $('admSessionEmail').textContent = (adminData && adminData.name) || (manzana ? `Administración Mz ${manzana}` : '') || (adminData && adminData.phone) || '';
  const badge = $('admManzanaBadge');
  badge.classList.remove('hidden');
  badge.textContent = isSuper ? '⭐ Super Administración' : `Administración Manzana ${manzana}`;
  applyTabVisibility(isSuper);
  switchPanel(isSuper ? 'dashboard' : 'announcements');
  if (isSuper) loadAll();
}

// Muestra/oculta pestañas según el nivel del administrador
function applyTabVisibility(isSuper) {
  document.querySelectorAll('.adm-tab').forEach(t => {
    const needsSuper = t.dataset.panel !== 'announcements';
    t.classList.toggle('hidden', !isSuper && needsSuper);
  });
}

function leavePanel() {
  API.logoutAdmin();
  $('adminPanelView').classList.add('hidden');
  $('adminLoginView').classList.remove('hidden');
}

// ---------- TABS ----------
function switchPanel(name) {
  document.querySelectorAll('.adm-tab').forEach(t => {
    const active = t.dataset.panel === name;
    t.classList.toggle('border-orange-500', active);
    t.classList.toggle('text-orange-600', active);
    t.classList.toggle('text-slate-500', !active);
  });
  ['dashboard', 'pqrs', 'orders', 'businesses', 'residents', 'support', 'announcements'].forEach(p => {
    const el = $('panel-' + p);
    if (el) el.classList.toggle('hidden', p !== name);
  });
  if (name === 'dashboard') loadDashboard();
  if (name === 'pqrs') loadPqrs();
  if (name === 'orders') loadOrders();
  if (name === 'businesses') loadBusinesses();
  if (name === 'residents') loadResidents();
  if (name === 'support') loadSupport();
  if (name === 'announcements') loadAnnouncements();
}

// ---------- LOAD ALL ----------
async function loadAll() {
  loadDashboard();
  loadPqrs();
  loadOrders();
  loadBusinesses();
  loadResidents();
  loadSupport();
  loadAnnouncements();
}

// ---------- DASHBOARD (solo super admin) ----------
async function loadDashboard() {
  const cards = $('dashCards');
  const bars = $('dashBars');
  const barsLabels = $('dashBarsLabels');
  const breakdowns = $('dashBreakdowns');
  if (!cards) return;
  cards.innerHTML = '<p class="text-xs text-slate-400 col-span-2">Cargando estadísticas...</p>';
  try {
    const res = await API.getAdminStats();
    if (!res || !res.success) {
      cards.innerHTML = `<p class="text-xs font-bold text-red-600 col-span-2">${(res && res.message) || 'No pudimos cargar las estadísticas.'}</p>`;
      return;
    }
    const d = res.data;

    const card = (label, value, color) => `
      <div class="border border-slate-200 rounded-2xl p-3.5 bg-white">
        <p class="text-2xl font-extrabold ${color}">${value}</p>
        <p class="text-[10px] font-bold text-slate-500 uppercase mt-0.5">${label}</p>
      </div>`;
    cards.innerHTML = [
      card('Visitas hoy', d.visits.today, 'text-orange-600'),
      card('Visitas totales', d.visits.total, 'text-orange-600'),
      card('Vitrinas activas', (d.businesses.byStatus && d.businesses.byStatus.active) || 0, 'text-emerald-600'),
      card('Residentes', d.residents.total, 'text-blue-600')
    ].join('');

    // Barras de visitas (7 días)
    const max = Math.max(1, ...d.visits.last7Days.map(x => x.visits));
    bars.innerHTML = d.visits.last7Days.map(x => {
      const h = Math.round((x.visits / max) * 100);
      return `<div class="flex-1 bg-orange-200 rounded-t-md relative" style="height:${Math.max(h, 4)}%">
        <span class="absolute -top-4 left-0 right-0 text-[9px] font-extrabold text-slate-600 text-center">${x.visits}</span>
      </div>`;
    }).join('');
    barsLabels.innerHTML = d.visits.last7Days.map(x => {
      const parts = x.date.split('-');
      return `<div class="flex-1">${parts[2]}</div>`;
    }).join('');

    // Desgloses
    const chips = (obj, colors) => {
      const entries = Object.entries(obj || {});
      if (!entries.length) return '<span class="text-[11px] text-slate-400">Sin datos</span>';
      return entries.map(([k, v]) => {
        const color = (colors && colors[k]) || 'bg-slate-100 text-slate-700';
        return `<span class="inline-block text-[10px] font-extrabold px-2 py-1 rounded-full ${color} mr-1.5 mb-1.5">${k}: ${v}</span>`;
      }).join('');
    };
    const block = (title, content) => `
      <div class="border border-slate-200 rounded-2xl p-3.5 bg-white">
        <p class="text-xs font-extrabold text-slate-700 mb-2">${title}</p>
        <div>${content}</div>
      </div>`;
    breakdowns.innerHTML = [
      block('Vitrinas por manzana', chips(d.businesses.byManzana, {
        '1': 'bg-orange-100 text-orange-700', '2': 'bg-amber-100 text-amber-700',
        '3': 'bg-emerald-100 text-emerald-700', '4': 'bg-blue-100 text-blue-700',
        '5': 'bg-violet-100 text-violet-700', '6': 'bg-rose-100 text-rose-700'
      })),
      block('PQRS por estado', chips(d.pqrs.byStatus)),
      block('Pedidos por estado', chips(d.orders.byStatus)),
      block('Solicitudes de soporte', `<span class="text-[10px] font-extrabold px-2 py-1 rounded-full bg-sky-100 text-sky-700">${d.support.total} en total</span>`)
    ].join('');
  } catch (error) {
    cards.innerHTML = `<p class="text-xs font-bold text-red-600 col-span-2">${error.message}</p>`;
  }
}

// ---------- RESIDENTES ----------
let residentsCache = [];
let residentsFilter = '';

async function loadResidents() {
  const container = $('residentsListContainer');
  container.innerHTML = '<p class="text-xs text-slate-400">Cargando residentes...</p>';
  const res = await API.adminResidents();
  if (!res || !res.success) {
    container.innerHTML = `<p class="text-xs text-red-500 font-bold">${(res && res.message) || 'No pudimos cargar los residentes.'}</p>`;
    return;
  }
  residentsCache = res.data || [];
  renderResidents();
}

function renderResidents() {
  const container = $('residentsListContainer');
  const q = residentsFilter.toLowerCase();
  const list = residentsCache
    .filter(r => {
      if (!q) return true;
      return (r.phone || '').toLowerCase().includes(q)
        || (r.role || '').toLowerCase().includes(q)
        || String(r.manzana || '').includes(q)
        || (r.tower || '').toLowerCase().includes(q)
        || (r.apartment || '').toLowerCase().includes(q);
    });

  const buyers = list.filter(r => r.role === 'buyer').length;
  const guards = list.filter(r => r.role === 'guard').length;
  const sellers = list.filter(r => r.role === 'seller').length;

  container.innerHTML = `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <div class="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
        <p class="text-xl font-extrabold text-orange-600">${residentsCache.length}</p>
        <p class="text-[10px] font-bold text-slate-500 uppercase">Total</p>
      </div>
      <div class="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
        <p class="text-xl font-extrabold text-blue-600">${buyers}</p>
        <p class="text-[10px] font-bold text-slate-500 uppercase">Compradores</p>
      </div>
      <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
        <p class="text-xl font-extrabold text-emerald-600">${sellers}</p>
        <p class="text-[10px] font-bold text-slate-500 uppercase">Emprendedores</p>
      </div>
      <div class="bg-violet-50 border border-violet-200 rounded-2xl p-3 text-center">
        <p class="text-xl font-extrabold text-violet-600">${guards}</p>
        <p class="text-[10px] font-bold text-slate-500 uppercase">Guardas</p>
      </div>
    </div>
    ${list.length === 0 ? '<p class="text-xs text-slate-400">Sin residentes que mostrar.</p>' : list.map(r => {
      const rol = r.role === 'seller' ? 'bg-emerald-100 text-emerald-700' : (r.role === 'guard' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700');
      const rolTxt = r.role === 'seller' ? 'Emprendedor' : (r.role === 'guard' ? 'Guarda' : 'Comprador');
      const fecha = r.lastEntryAt || r.createdAt || '';
      return `<div class="border border-slate-200 rounded-2xl p-3.5 bg-white">
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <p class="text-[13px] font-extrabold text-slate-800">+${r.phone || '—'}</p>
            <p class="text-[11px] text-slate-500 font-bold">Manzana ${r.manzana || '—'} · ${r.tower || '—'} · Apto ${r.apartment || '—'}</p>
          </div>
          <span class="flex-shrink-0 text-[10px] font-extrabold px-2 py-1 rounded-full ${rol}">${rolTxt}</span>
        </div>
        <div class="mt-2 flex items-center justify-between text-[10px] text-slate-400 font-bold">
          <span>${r.businessCount ? `🛍 ${r.businessCount} vitrina(s)` : 'Sin vitrina'}</span>
          <span>Ingreso: ${fecha ? formatResidentDate(fecha) : '—'}</span>
        </div>
      </div>`;
    }).join('')}`;
}

function formatResidentDate(iso) {
  try {
    return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
  } catch (e) {
    return iso || '';
  }
}

// ---------- PQRS ----------
const ESTADO_COLORS = {
  'Pendiente': 'bg-amber-100 text-amber-700',
  'En Proceso': 'bg-blue-100 text-blue-700',
  'Resuelto': 'bg-emerald-100 text-emerald-700'
};

// Nombre amigable por id de categoría (los ids se mantienen estables en categorias.json)
const CATEGORY_NAMES = {
  'hogar': 'Tiendas y minimarket',
  'gastronomia': 'Gastronomía',
  'belleza': 'Belleza y cuidado',
  'servicios': 'Servicios',
  'clases': 'Otros',
  'General': 'General'
};
const categoryName = (id) => CATEGORY_NAMES[id] || id || 'General';

async function loadPqrs() {
  const container = $('pqrsListContainer');
  container.innerHTML = '<p class="text-xs text-slate-400 p-2">Cargando...</p>';
  const estado = $('pqrsFilterEstado').value;
  const filters = estado ? { estado } : {};

  try {
    const res = await API.getPqrs(filters);
    const items = res.data || [];
    if (items.length === 0) {
      container.innerHTML = '<p class="text-xs text-slate-400 bg-slate-50 p-4 rounded-xl text-center">No hay solicitudes PQRS.</p>';
      return;
    }
    container.innerHTML = items.map(t => `
      <div class="border border-slate-200 rounded-2xl p-3 space-y-2" data-id="${t.id}">
        <div class="flex items-center justify-between">
          <span class="font-mono text-[10px] font-extrabold text-orange-600">${t.ticketId}</span>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${ESTADO_COLORS[t.estado] || 'bg-slate-100 text-slate-600'}">${t.estado}</span>
        </div>
        <div>
          <span class="text-[10px] font-bold text-purple-600 uppercase">${t.tipo}</span>
          <h4 class="text-sm font-extrabold text-slate-900 line-clamp-1">${t.descripcion}</h4>
          <p class="text-xs text-slate-500 line-clamp-2">${t.descripcion}</p>
        </div>
        <div class="flex items-center justify-between text-[10px] text-slate-400">
          <span>${t.nombre} · 📞 ${t.telefono || '—'}</span>
          <button class="pqrs-open text-orange-600 font-extrabold" data-id="${t.id}">Abrir</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.pqrs-open').forEach(b => {
      b.addEventListener('click', () => openPqrsDetail(b.dataset.id, items));
    });
  } catch (error) {
    container.innerHTML = `<p class="text-xs font-bold text-red-600 p-2">${error.message}</p>`;
  }
}

let currentPqrsDetail = null;
let currentPqrsItems = [];

function openPqrsDetail(id, items) {
  currentPqrsItems = items;
  currentPqrsDetail = items.find(t => t.id === id);
  if (!currentPqrsDetail) return;

  $('pqrsDetailTicket').textContent = currentPqrsDetail.ticketId;
  $('pqrsDetailTipo').textContent = currentPqrsDetail.tipo;

  const notas = (currentPqrsDetail.notas || []).map(n => `
    <div class="bg-slate-50 p-2 rounded-lg">
      <p class="text-[11px] text-slate-700">${n.texto}</p>
      <span class="text-[9px] text-slate-400">${n.autor || 'Administración'} · ${new Date(n.createdAt).toLocaleString('es-CO')}</span>
    </div>`).join('') || '<p class="text-[11px] text-slate-400">Sin notas de seguimiento.</p>';

  $('pqrsDetailBody').innerHTML = `
    <div class="bg-slate-50 p-3 rounded-xl space-y-1">
      <p class="text-slate-700 leading-relaxed">${currentPqrsDetail.descripcion}</p>
    </div>
    <div class="grid grid-cols-2 gap-2 text-[11px]">
      <div><span class="text-slate-400 block">Nombre</span><b>${currentPqrsDetail.nombre}</b></div>
      <div><span class="text-slate-400 block">Teléfono</span><b>${currentPqrsDetail.telefono || '—'}</b></div>
      <div><span class="text-slate-400 block">Correo (opcional)</span><b>${currentPqrsDetail.email || '—'}</b></div>
      <div><span class="text-slate-400 block">Radicada</span><b>${new Date(currentPqrsDetail.createdAt).toLocaleDateString('es-CO')}</b></div>
    </div>
    <div>
      <h5 class="font-extrabold text-slate-800 mb-1">Seguimiento</h5>
      <div class="space-y-1.5">${notas}</div>
    </div>
  `;

  $('pqrsDetailModal').classList.remove('hidden');
}

async function handlePqrsStatusChange() {
  if (!currentPqrsDetail) return;
  const nuevo = $('pqrsDetailNewStatus').value;
  const res = await API.updatePqrsStatus(currentPqrsDetail.id, nuevo);
  if (res.success) {
    $('pqrsDetailModal').classList.add('hidden');
    loadPqrs();
  } else {
    alert(res.message || 'Error al cambiar estado');
  }
}

async function handlePqrsAddNote() {
  if (!currentPqrsDetail) return;
  const nota = $('pqrsDetailNewNote').value.trim();
  if (!nota) return;
  const res = await API.addPqrsNote(currentPqrsDetail.id, nota);
  if (res.success) {
    $('pqrsDetailNewNote').value = '';
    openPqrsDetail(currentPqrsDetail.id, currentPqrsItems);
  } else {
    alert(res.message || 'Error al agregar nota');
  }
}

// ---------- ORDERS ----------
const ORDER_COLORS = {
  'Recibido': 'bg-amber-100 text-amber-700',
  'En Preparación': 'bg-blue-100 text-blue-700',
  'En Camino': 'bg-purple-100 text-purple-700',
  'Entregado': 'bg-emerald-100 text-emerald-700',
  'Cancelado': 'bg-red-100 text-red-700'
};

async function loadOrders() {
  const container = $('ordersListContainer');
  try {
    const res = await API.getOrders();
    const items = res.data || [];
    if (items.length === 0) {
      container.innerHTML = '<p class="text-xs text-slate-400 bg-slate-50 p-4 rounded-xl text-center">No hay pedidos aún.</p>';
      return;
    }
    container.innerHTML = items.map(o => `
      <div class="border border-slate-200 rounded-2xl p-3 space-y-2">
        <div class="flex items-center justify-between">
          <span class="font-mono text-[10px] font-extrabold text-orange-600">${o.orderId}</span>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${ORDER_COLORS[o.estado] || 'bg-slate-100 text-slate-600'}">${o.estado}</span>
        </div>
        <div class="text-xs">
          <div class="font-extrabold text-slate-900">${o.businessName}</div>
          <div class="text-slate-500">${o.products.map(p => `${p.name} ×${p.qty}`).join(', ')}</div>
        </div>
        <div class="flex items-center justify-between text-[10px] text-slate-400">
          <span>${o.resident.fullName} · ${o.resident.tower} Apto ${o.resident.apartment}</span>
          <span>${new Date(o.createdAt).toLocaleString('es-CO')}</span>
        </div>
        <div class="flex space-x-2">
          <select class="order-status flex-1 border border-slate-200 rounded-xl text-[10px] p-2" data-id="${o.id}">
            ${Object.keys(ORDER_COLORS).map(e => `<option ${e === o.estado ? 'selected' : ''}>${e}</option>`).join('')}
          </select>
          <button class="order-status-btn px-3 py-1.5 bg-slate-900 text-white text-[10px] font-bold rounded-xl" data-id="${o.id}">Guardar</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.order-status-btn').forEach(b => {
      b.addEventListener('click', async () => {
        const id = b.dataset.id;
        const val = container.querySelector(`.order-status[data-id="${id}"]`).value;
        const r = await API.updateOrderStatus(id, val);
        if (r.success) loadOrders(); else alert(r.message || 'Error');
      });
    });
  } catch (error) {
    container.innerHTML = `<p class="text-xs font-bold text-red-600 p-2">${error.message}</p>`;
  }
}

// ---------- BUSINESSES ----------
async function loadBusinesses() {
  const container = $('businessesListContainer');
  try {
    const items = await API.getBusinesses();
    if (items.length === 0) {
      container.innerHTML = '<p class="text-xs text-slate-400 bg-slate-50 p-4 rounded-xl text-center">No hay vitrinas.</p>';
      return;
    }
    container.innerHTML = items.map(b => `
      <div class="border border-slate-200 rounded-2xl p-3 flex items-center space-x-3">
        <img src="${b.coverImage}" class="w-12 h-12 rounded-xl object-cover flex-shrink-0" alt="${b.name}" />
        <div class="flex-1 min-w-0">
          <h4 class="text-sm font-extrabold text-slate-900 truncate">${b.name}</h4>
          <span class="text-[10px] text-slate-400">Mz ${b.manzana} · ${categoryName(b.category)} · ${b.phone}</span>
          <div class="text-[10px] text-slate-500">IG: ${b.instagram || '—'} · FB: ${b.facebook || '—'}</div>
        </div>
        <button class="biz-del px-2.5 py-2 bg-red-50 text-red-600 rounded-xl text-xs font-bold" data-id="${b.id}" title="Eliminar">🗑</button>
      </div>
    `).join('');

    container.querySelectorAll('.biz-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar esta vitrina?')) return;
        const r = await API.adminDeleteBusiness(btn.dataset.id);
        if (r.success) loadBusinesses(); else alert(r.message || 'Error');
      });
    });
  } catch (error) {
    container.innerHTML = `<p class="text-xs font-bold text-red-600 p-2">${error.message}</p>`;
  }
}

// ---------- SOPORTE ----------
// Números que dejaron emprendedores para que el equipo los contacte
async function loadSupport() {
  const container = $('supportListContainer');
  container.innerHTML = '<p class="text-xs text-slate-400 p-2">Cargando...</p>';
  try {
    const res = await API.getSupportRequests();
    const items = (res && res.data) || [];
    if (items.length === 0) {
      container.innerHTML = '<p class="text-xs text-slate-400 bg-slate-50 p-4 rounded-xl text-center">Aún no hay solicitudes de soporte.</p>';
      return;
    }
    container.innerHTML = items.map(r => {
      const digits = (r.telefono || '').replace(/\D/g, '');
      const wa = /^57/.test(digits) ? digits : `57${digits}`;
      const msg = encodeURIComponent('Hola, te contactamos por tu solicitud de ayuda en Vitrina Digital Los Naranjos.');
      return `
      <div class="border border-slate-200 rounded-2xl p-3 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-extrabold text-orange-600 uppercase">${r.estado || 'Nueva'}</span>
          <span class="text-[10px] text-slate-400">${new Date(r.createdAt).toLocaleString('es-CO')}</span>
        </div>
        <div>
          <p class="text-sm font-extrabold text-slate-900">📞 ${r.telefono}</p>
          <p class="text-[11px] text-slate-500 mt-0.5 line-clamp-2">${r.mensaje || 'Sin mensaje adicional.'}</p>
        </div>
        <div class="flex space-x-2">
          <a href="https://wa.me/${wa}?text=${msg}" target="_blank" rel="noopener" class="flex-1 py-2 bg-[#25D366] text-white text-[11px] font-bold rounded-xl text-center">WhatsApp</a>
          <a href="tel:${digits}" class="flex-1 py-2 bg-slate-900 text-white text-[11px] font-bold rounded-xl text-center">Llamar</a>
        </div>
      </div>`;
    }).join('');
  } catch (error) {
    container.innerHTML = `<p class="text-xs font-bold text-red-600 p-2">${error.message}</p>`;
  }
}

// ---------- COMUNICADOS OFICIALES POR MANZANA ----------
function getAdminManzana() {
  const mz = localStorage.getItem('adminManzana');
  return mz && mz !== 'all' && mz !== '' ? mz : '';
}

function selectedAnnMz() {
  const sel = document.getElementById('annMZ');
  return sel ? sel.value : getAdminManzana();
}

// Bloquea el selector de manzana cuando el admin pertenece a una manzana
function lockManzanaForAdmin() {
  const mz = getAdminManzana();
  const wrap = document.getElementById('annMzWrap');
  if (mz && wrap) {
    wrap.innerHTML = `
      <div>
        <label class="font-bold text-xs text-slate-700 block mb-1">Manzana</label>
        <span class="w-full inline-flex items-center justify-between border border-orange-200 bg-orange-50 text-orange-700 rounded-xl p-2.5 text-xs font-extrabold">
          Manzana ${mz} <i class="fa-solid fa-lock text-[10px]"></i>
        </span>
      </div>
      <div id="annRecipientsBox" class="flex flex-col justify-end">
        <span class="w-full text-[11px] font-bold text-slate-500 bg-white border border-slate-200 rounded-xl p-2.5 text-center" id="annRecipientsPreview">— destinatarios</span>
      </div>`;
  }
}

async function refreshRecipientsPreview() {
  const mz = selectedAnnMz();
  const el = document.getElementById('annRecipientsPreview');
  if (!el) return;
  if (!mz) { el.textContent = '— destinatarios'; return; }
  el.textContent = 'Calculando...';
  try {
    const r = await API.getAnnouncementRecipients(mz);
    const n = (r && r.data && r.data.count) || 0;
    el.textContent = `${n} residente${n === 1 ? '' : 's'} al WhatsApp`;
  } catch (e) {
    el.textContent = '— destinatarios';
  }
}

let pendingAnnFile = null;

function handleAnnFileSelect(e) {
  const file = e.target.files && e.target.files[0];
  const preview = $('annFilePreview');
  if (!file) {
    pendingAnnFile = null;
    preview.classList.add('hidden');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert('El adjunto supera el tamaño máximo (5MB).');
    e.target.value = '';
    pendingAnnFile = null;
    preview.classList.add('hidden');
    return;
  }
  pendingAnnFile = file;
  $('annFileName').textContent = file.name;
  preview.classList.remove('hidden');
}

function clearAnnFile() {
  pendingAnnFile = null;
  $('annFile').value = '';
  $('annFilePreview').classList.add('hidden');
}

async function handleAnnPublish() {
  const title = $('annTitle').value.trim();
  const body = $('annBody').value.trim();
  const mz = selectedAnnMz();
  const sendWa = $('annSendWa').checked;
  const errEl = $('annFormError');
  const btn = $('annPublishBtn');

  const showErr = m => { errEl.textContent = m; errEl.classList.remove('hidden'); };
  if (!mz) { showErr('Selecciona la manzana del comunicado.'); return; }
  if (!title) { showErr('El título es obligatorio.'); return; }

  errEl.classList.add('hidden');
  btn.disabled = true;
  btn.innerText = 'Publicando...';
  try {
    let mediaUrl = '';
    let kind = 'text';
    if (pendingAnnFile) {
      const up = await API.uploadAnnouncementDoc(pendingAnnFile);
      if (!up.success) { showErr(up.message || 'Error al subir el adjunto.'); return; }
      mediaUrl = up.data.url;
      kind = up.data.kind;
    }
    const r = await API.createAnnouncement({
      manzana: mz,
      title,
      body: body || undefined,
      mediaUrl: mediaUrl || undefined,
      kind,
      sendWhatsApp: sendWa
    });
    if (!r.success) { showErr(r.message || 'Error al publicar.'); return; }

    $('annTitle').value = '';
    $('annBody').value = '';
    clearAnnFile();
    $('annSendWa').checked = true;
    alert(r.message || 'Comunicado publicado.');
    await loadAnnouncements();
    await refreshRecipientsPreview();
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-bullhorn"></i> Publicar';
  }
}

async function loadAnnouncements() {
  const container = $('annListContainer');
  container.innerHTML = '<p class="text-xs text-slate-400 p-2">Cargando...</p>';
  lockManzanaForAdmin();
  refreshRecipientsPreview();
  try {
    const res = await API.getAdminAnnouncements();
    const items = (res && res.data) || [];
    if (!items.length) {
      container.innerHTML = '<p class="text-xs text-slate-400 bg-slate-50 p-4 rounded-xl text-center">Aún no hay comunicados publicados.</p>';
      return;
    }
    container.innerHTML = items.map(a => {
      const media =
        a.kind === 'image' && a.mediaUrl
          ? `<img src="${a.mediaUrl}" class="w-12 h-12 rounded-xl object-cover flex-shrink-0" alt="" />`
          : a.kind === 'pdf'
            ? `<div class="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-file-pdf text-xl"></i></div>`
            : `<div class="w-12 h-12 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-bullhorn text-xl"></i></div>`;
      const wa = a.broadcastSent
        ? `<span class="text-[10px] font-bold text-emerald-600"><i class="fa-solid fa-circle-check"></i> WhatsApp enviado (${a.recipientsCount || 0})</span>`
        : `<button class="ann-broadcast text-[10px] font-extrabold text-emerald-600 underline" data-id="${a.id}">Enviar por WhatsApp</button>`;
      return `
        <div class="border border-slate-200 rounded-2xl p-3 space-y-2">
          <div class="flex justify-between items-start">
            <div class="flex items-center space-x-3 min-w-0">
              ${media}
              <div class="min-w-0">
                <span class="text-[9px] font-extrabold text-orange-600 uppercase">Oficial Mz ${a.manzana}</span>
                <h4 class="text-sm font-extrabold text-slate-900 truncate">${a.title}</h4>
              </div>
            </div>
            <span class="text-[10px] text-slate-400 flex-shrink-0">${new Date(a.createdAt).toLocaleDateString('es-CO')}</span>
          </div>
          ${a.body ? `<p class="text-xs text-slate-500 line-clamp-2 px-1">${a.body}</p>` : ''}
          <div class="flex items-center justify-between pt-1">
            ${wa}
            <div class="flex space-x-1.5">
              <button class="ann-open px-2.5 py-1 text-[10px] font-bold bg-slate-100 text-slate-700 rounded-lg" data-id="${a.id}">Ver</button>
              <button class="ann-del px-2.5 py-1 text-[10px] font-bold bg-red-50 text-red-600 rounded-lg" data-id="${a.id}">Eliminar</button>
            </div>
          </div>
        </div>`;
    }).join('');

    container.querySelectorAll('.ann-open').forEach(b => b.addEventListener('click', () => {
      const ann = items.find(x => x.id === b.dataset.id);
      if (!ann) return;
      $('annViewBody').innerHTML = renderAnnPreview(ann);
      $('annViewModal').classList.remove('hidden');
    }));
    container.querySelectorAll('.ann-del').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este comunicado?')) return;
      const r = await API.deleteAnnouncement(b.dataset.id);
      if (r.success) loadAnnouncements(); else alert(r.message || 'Error');
    }));
    container.querySelectorAll('.ann-broadcast').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('¿Enviar por WhatsApp a los residentes de la manzana?')) return;
      const btn = b;
      btn.textContent = 'Enviando...';
      const r = await API.broadcastAnnouncement(b.dataset.id);
      alert(r.success
        ? `Enviado a ${(r.data && r.data.sentTo) || 0} residentes.` + (r.data && r.data.dev ? '\n(Modalidad demo: solo log en consola.)' : '')
        : (r.message || 'Error al enviar'));
      if (r.success) loadAnnouncements();
    }));
  } catch (error) {
    container.innerHTML = `<p class="text-xs font-bold text-red-600 p-2">${error.message}</p>`;
  }
}

// Vista previa reutilizable de un comunicado (también usada por el modal público)
function renderAnnPreview(a) {
  const fecha = a.createdAt ? new Date(a.createdAt).toLocaleString('es-CO') : '';
  const media =
    a.kind === 'image' && a.mediaUrl
      ? `<img src="${a.mediaUrl}" class="w-full h-44 object-cover rounded-xl" alt="" />`
      : a.kind === 'pdf'
        ? `<div class="rounded-xl bg-red-50 border border-red-100 p-3 text-xs text-red-700">
             <p class="font-extrabold mb-1">📄 Documento adjunto</p>
             <a href="${a.mediaUrl}" target="_blank" rel="noopener" class="text-orange-600 font-bold underline">Abrir PDF →</a>
           </div>`
        : '';
  return `
    <div class="space-y-3">
      <span class="text-[10px] font-extrabold text-orange-600 uppercase">${a.manzana ? 'Oficial Manzana ' + a.manzana : ''}</span>
      ${media}
      <h4 class="font-extrabold text-slate-900">${a.title}</h4>
      ${a.body ? `<p class="text-sm text-slate-600 leading-relaxed whitespace-pre-line">${a.body}</p>` : ''}
      <p class="text-[10px] text-slate-400">Publicado: ${fecha}</p>
    </div>`;
}

// ---------- WIRING ----------
function init() {
  $('admSendCodeBtn').addEventListener('click', handleAdminSendCode);
  $('admPhone').addEventListener('keydown', e => { if (e.key === 'Enter') handleAdminSendCode(); });
  $('admVerifyBtn').addEventListener('click', handleAdminVerify);
  $('admLogoutBtn').addEventListener('click', leavePanel);

  document.querySelectorAll('.adm-tab').forEach(t => t.addEventListener('click', () => switchPanel(t.dataset.panel)));

  $('pqrsFilterEstado').addEventListener('change', loadPqrs);
  $('pqrsDetailStatusBtn').addEventListener('click', handlePqrsStatusChange);
  $('pqrsDetailNoteBtn').addEventListener('click', handlePqrsAddNote);
  $('refreshOrdersBtn').addEventListener('click', loadOrders);
  $('refreshBusinessesBtn').addEventListener('click', loadBusinesses);
  $('refreshSupportBtn').addEventListener('click', loadSupport);
  $('refreshAnnBtn').addEventListener('click', loadAnnouncements);
  const refreshDashBtn = $('refreshDashboardBtn');
  if (refreshDashBtn) refreshDashBtn.addEventListener('click', loadDashboard);
  $('annPublishBtn').addEventListener('click', handleAnnPublish);
  $('annFile').addEventListener('change', handleAnnFileSelect);
  $('annFileClear').addEventListener('click', clearAnnFile);
  const mzSel = document.getElementById('annMZ');
  if (mzSel) mzSel.addEventListener('change', refreshRecipientsPreview);

  $('refreshResidentsBtn').addEventListener('click', loadResidents);
  const resSearch = document.getElementById('residentsSearch');
  if (resSearch) resSearch.addEventListener('input', e => { residentsFilter = e.target.value.trim(); renderResidents(); });

  // Auto-login si hay una sesión guardada/activa (valida la cookie en el servidor)
  if (API.getAdminToken() || localStorage.getItem('adminPhone')) {
    API.getMe().then(me => {
      if (me && me.ok && me.data && me.data.isAdmin) {
        if (me.data.scope) localStorage.setItem('adminScope', me.data.scope);
        enterPanel({
          manzana: me.data.manzana || localStorage.getItem('adminManzana') || '',
          phone: me.data.phone || '',
          scope: me.data.scope || API.getAdminScope()
        });
      } else {
        API.logoutAdmin();
      }
    }).catch(() => API.logoutAdmin());
  }
}

window.closeAdminModal = () => $('pqrsDetailModal').classList.add('hidden');
window.closeAdminAnnView = () => $('annViewModal').classList.add('hidden');
function setupModalScrollLock(){const modals=document.querySelectorAll('[id$="Modal"]');const sync=()=>{const anyOpen=Array.from(modals).some(el=>!el.classList.contains('hidden'));document.body.classList.toggle('modal-open',anyOpen)};modals.forEach(el=>new MutationObserver(sync).observe(el,{attributes:true,attributeFilter:['class']}));sync()}
document.addEventListener('DOMContentLoaded', () => { document.querySelectorAll('button').forEach(b => { if (!b.hasAttribute('type')) b.type = 'button'; }); document.querySelectorAll('[data-close]').forEach(b => { b.addEventListener('click', () => { const fn = window[b.dataset.close]; if (typeof fn === 'function') fn(); }); }); setupModalScrollLock(); init(); });
