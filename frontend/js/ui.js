// Módulo de renderizado y componentes visuales para Vitrina Digital Los Naranjos

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export const UI = {
  // Renderizar cuadrícula de categorías
  renderCategories(categories, currentCatId, onSelect) {
    const container = document.getElementById('categoriesGrid');
    if (!container) return;

    container.innerHTML = categories.map(cat => {
      const isActive = cat.id === currentCatId;
      const activeRing = isActive ? 'ring-2 ring-offset-2 ring-orange-500' : '';
      const labelClass = isActive ? 'font-extrabold text-orange-600' : 'font-semibold text-slate-600';

      return `
        <button data-id="${cat.id}" class="cat-btn flex flex-col items-center gap-1.5 text-center transition touch-btn group">
          <span class="w-full h-14 rounded-2xl flex items-center justify-center text-xl text-white shadow-sm transition group-active:scale-95 ${activeRing} ${cat.color}">
            <i class="fa-solid ${cat.icon}"></i>
          </span>
          <span class="text-[11px] leading-tight line-clamp-1 ${labelClass}">${cat.name}</span>
        </button>
      `;
    }).join('');

    container.querySelectorAll('.cat-btn').forEach(btn => {
      btn.addEventListener('click', () => onSelect(btn.dataset.id));
    });
  },

  // Renderizar carrusel de ofertas (solo las del día)
  renderOffers(offers, onOpenOffer, onContact) {
    const container = document.getElementById('offersContainer');
    if (!container) return;

    if (!offers || offers.length === 0) {
      container.innerHTML = `
        <div class="w-full bg-orange-50 border border-dashed border-orange-200 rounded-2xl p-4 text-center">
          <span class="text-xl">🏷️</span>
          <p class="text-xs font-bold text-orange-700 mt-1">Hoy no hay ofertas publicadas.</p>
          <p class="text-[10px] text-orange-500 mt-0.5">Sé el primero en publicar una oferta para tu vitrina.</p>
        </div>`;
      return;
    }

    container.innerHTML = offers.map(off => {
      const fecha = off.date ? new Date(off.date.replace(/-/g, '/') + ' 12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Hoy';
      return `
      <div data-id="${off.id}" class="offer-card w-64 flex-shrink-0 bg-white rounded-2xl border border-orange-200/80 p-2.5 shadow-sm hover:shadow-md transition cursor-pointer touch-btn flex flex-col justify-between">
        <div class="relative h-28 rounded-xl overflow-hidden mb-2">
          <img src="${off.image}" alt="${esc(off.title)}" class="w-full h-full object-cover" />
          <span class="absolute top-1.5 left-1.5 bg-red-600 text-white text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
            Oferta del día
          </span>
        </div>
        <div>
          <span class="text-[10px] font-bold text-orange-600 block uppercase tracking-wider truncate">${esc(off.bizName)}</span>
          <h4 class="text-xs font-extrabold text-slate-900 line-clamp-1">${esc(off.title)}</h4>
          <div class="flex items-baseline space-x-1.5 mt-1">
            <span class="text-sm font-extrabold text-emerald-600">${esc(off.price)}</span>
            ${off.oldPrice ? `<span class="text-[10px] text-slate-400 line-through">${esc(off.oldPrice)}</span>` : ''}
          </div>
          ${off.desc ? `<p class="text-[10px] text-slate-500 line-clamp-2 mt-1 leading-snug">${esc(off.desc)}</p>` : ''}
          <span class="inline-block mt-1.5 bg-slate-100 text-slate-500 text-[9px] font-bold px-2 py-0.5 rounded-full">📅 Válida ${fecha}</span>
        </div>
        <div class="grid grid-cols-2 gap-1.5 mt-2">
          <button class="offer-detail-btn py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold text-[11px] rounded-lg border border-orange-200">
            <i class="fa-solid fa-eye text-[10px] mr-1"></i>Detalle
          </button>
          <button class="offer-wa-btn py-1.5 bg-[#25D366] hover:bg-[#1ebd59] text-white font-bold text-[11px] rounded-lg flex items-center justify-center space-x-1 shadow">
            <i class="fa-brands fa-whatsapp text-[11px]"></i><span>Contactar</span>
          </button>
        </div>
      </div>`;
    }).join('');

    container.querySelectorAll('.offer-card, .offer-detail-btn').forEach(el => {
      el.addEventListener('click', () => onOpenOffer(el.closest('.offer-card').dataset.id));
    });
    container.querySelectorAll('.offer-wa-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onContact(btn.closest('.offer-card').dataset.id);
      });
    });
  },

  // Renderizar listado de vitrinas
  renderBusinesses(businesses, onOpenProfile, onQuickWhatsApp) {
    const container = document.getElementById('businessList');
    const countBadge = document.getElementById('businessCountBadge');
    if (!container) return;

    if (countBadge) {
      countBadge.innerText = `${businesses.length} vitrina${businesses.length === 1 ? '' : 's'} activa${businesses.length === 1 ? '' : 's'}`;
    }

    if (businesses.length === 0) {
      container.innerHTML = `
        <div class="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
          <span class="text-3xl">🔍</span>
          <h4 class="font-bold text-slate-700 text-sm mt-2">No encontramos vitrinas disponibles</h4>
          <p class="text-xs text-slate-500 mt-1">Prueba con otra palabra clave o selecciona otra manzana.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = businesses.map(biz => `
      <div class="bg-white rounded-2xl border border-slate-100 p-3.5 shadow-sm hover:shadow-md transition space-y-3 relative overflow-hidden">
        
        <!-- Encabezado de la tarjeta -->
        <div class="flex space-x-3 cursor-pointer open-profile-trigger" data-id="${biz.id}">
          <div class="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100">
            <img src="${biz.coverImage}" alt="${biz.name}" class="w-full h-full object-cover" />
            <span class="absolute top-1 left-1 bg-black/75 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
              Mz ${biz.manzana}
            </span>
          </div>
          
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">${biz.badge || 'Vecino Verificado'}</span>
              <span class="text-xs font-bold text-amber-500 flex items-center">
                <i class="fa-solid fa-star text-[10px] mr-1"></i> ${biz.rating}
              </span>
            </div>
            <h3 class="text-sm font-extrabold text-slate-900 leading-tight mt-1 truncate">${biz.name}</h3>
            <p class="text-xs text-slate-500 line-clamp-2 mt-1 leading-snug">${biz.shortDesc}</p>
          </div>
        </div>

        <!-- Botones de Acción Inmediata -->
        <div class="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 text-xs">
          <button data-id="${biz.id}" class="btn-profile py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl flex items-center justify-center space-x-1.5 touch-btn">
            <i class="fa-solid fa-store text-slate-600"></i>
            <span>Ver Vitrina</span>
          </button>
          
          <button data-id="${biz.id}" class="btn-wa py-2.5 bg-[#25D366] hover:bg-[#1ebd59] text-white font-extrabold rounded-xl flex items-center justify-center space-x-1.5 shadow touch-btn">
            <i class="fa-brands fa-whatsapp text-sm"></i>
            <span>WhatsApp</span>
          </button>
        </div>

      </div>
    `).join('');

    container.querySelectorAll('.open-profile-trigger, .btn-profile').forEach(el => {
      el.addEventListener('click', () => onOpenProfile(el.dataset.id));
    });

    container.querySelectorAll('.btn-wa').forEach(el => {
      el.addEventListener('click', () => onQuickWhatsApp(el.dataset.id));
    });
  },

  // Renderizar listado de vitrinas intercalando tarjetas promocionales de
  // comunicados oficiales cada "every" tarjetas (requisito de segmentación).
  renderBusinessesWithPromos(businesses, announcements, onOpenProfile, onQuickWhatsApp, onOpenAnn, every = 4) {
    const blockSize = Math.max(1, Number(every) || 4);
    const cards = businesses.map(biz => UI.businessCard(biz, onOpenProfile, onQuickWhatsApp));
    const promos = (announcements || []).map(ann => UI.annPromoCard(ann, onOpenAnn));

    const grid = [];
    for (let i = 0; i < cards.length; i++) {
      grid.push(cards[i]);
      if ((i + 1) % blockSize === 0 && promos.length) {
        grid.push(promos[(i / blockSize) % promos.length]);
      }
    }
    // Si hay promos pero no completaron un bloque, se agregan al final
    if (promos.length && grid.length && grid[grid.length - 1] !== promos[promos.length - 1]) {
      grid.push.apply(grid, promos);
    }

    const container = document.getElementById('businessList');
    if (!container) return;
    const countBadge = document.getElementById('businessCountBadge');
    if (countBadge) {
      countBadge.innerText = `${businesses.length} vitrina${businesses.length === 1 ? '' : 's'} activa${businesses.length === 1 ? '' : 's'}`;
    }
    container.innerHTML = grid.join('');

    container.querySelectorAll('.open-profile-trigger, .btn-profile').forEach(el => {
      el.addEventListener('click', () => onOpenProfile(el.dataset.id));
    });
    container.querySelectorAll('.btn-wa').forEach(el => {
      el.addEventListener('click', () => onQuickWhatsApp(el.dataset.id));
    });
    container.querySelectorAll('.ann-promo').forEach(el => {
      el.addEventListener('click', () => onOpenAnn(el.dataset.ann));
    });
  },

  // Tarjeta individual de vitrina (reutilizable por renderBusinesses)
  businessCard(biz, onOpenProfile, onQuickWhatsApp) {
    return `
      <div class="bg-white rounded-2xl border border-slate-100 p-3.5 shadow-sm hover:shadow-md transition space-y-3 relative overflow-hidden">
        <div class="flex space-x-3 cursor-pointer open-profile-trigger" data-id="${biz.id}">
          <div class="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100">
            <img src="${biz.coverImage}" alt="${esc(biz.name)}" class="w-full h-full object-cover" />
            <span class="absolute top-1 left-1 bg-black/75 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
              Mz ${esc(biz.manzana)}
            </span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">${esc(biz.badge || 'Vecino Verificado')}</span>
              <span class="text-xs font-bold text-amber-500 flex items-center">
                <i class="fa-solid fa-star text-[10px] mr-1"></i> ${esc(biz.rating)}${biz.ratingCount ? `·${biz.ratingCount}` : ''}
              </span>
            </div>
            <h3 class="text-sm font-extrabold text-slate-900 leading-tight mt-1 truncate">${esc(biz.name)}</h3>
            <p class="text-xs text-slate-500 line-clamp-2 mt-1 leading-snug">${esc(biz.shortDesc)}</p>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 text-xs">
          <button data-id="${biz.id}" class="btn-profile py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl flex items-center justify-center space-x-1.5 touch-btn">
            <i class="fa-solid fa-store text-slate-600"></i>
            <span>Ver Vitrina</span>
          </button>
          <button data-id="${biz.id}" class="btn-wa py-2.5 bg-[#25D366] hover:bg-[#1ebd59] text-white font-extrabold rounded-xl flex items-center justify-center space-x-1.5 shadow touch-btn">
            <i class="fa-brands fa-whatsapp text-sm"></i>
            <span>WhatsApp</span>
          </button>
        </div>
      </div>`;
  },

  // Tarjeta promocional de comunicado para intercalar en el feed
  annPromoCard(ann, onOpenAnn) {
    const isImage = ann.kind === 'image' && ann.mediaUrl;
    const media = isImage
      ? `<img src="${esc(ann.mediaUrl)}" alt="${esc(ann.title)}" class="w-full h-24 object-cover rounded-xl" />`
      : (ann.kind === 'pdf'
        ? `<div class="flex items-center justify-center gap-2 py-3 bg-red-50 text-red-700 rounded-xl text-xs font-extrabold"><i class="fa-solid fa-file-pdf text-lg"></i> PDF adjunto</div>`
        : '');
    return `
      <div data-ann="${ann.id}" class="ann-promo ann-promo bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-3.5 shadow-md text-white space-y-2.5 border-2 border-orange-400/70 cursor-pointer touch-btn">
        <div class="flex items-center justify-between">
          <span class="text-[9px] font-extrabold uppercase tracking-wider bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full"><i class="fa-solid fa-shield-halved mr-1"></i>Oficial Mz ${esc(ann.manzana)}</span>
          <i class="fa-solid fa-bullhorn text-orange-300 text-sm"></i>
        </div>
        ${media}
        <div>
          <h4 class="text-xs font-extrabold leading-tight">${esc(ann.title)}</h4>
          ${ann.body ? `<p class="text-[10px] text-slate-300 line-clamp-2 mt-1 leading-snug">${esc(ann.body)}</p>` : ''}
        </div>
        <button class="w-full py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-[11px] rounded-xl border border-white/20">Ver comunicado</button>
      </div>`;
  },

  // Raíl de historias tipo Instagram (comunicados de la manzana activa)
  renderAnnStories(announcements, manzana, onOpenAnn) {
    const container = document.getElementById('annStoriesContainer');
    const empty = document.getElementById('annStoriesEmpty');
    const label = document.getElementById('annMzLabel');
    if (!container || !empty) return;

    if (!manzana || manzana === 'all' || !announcements.length) {
      container.innerHTML = '';
      label.textContent = '';
      empty.classList.toggle('hidden', false);
      return;
    }

    empty.classList.add('hidden');
    label.textContent = `Administración Mz ${manzana}`;

    container.innerHTML = announcements.map(ann => {
      const media = ann.kind === 'image' && ann.mediaUrl
        ? `<img src="${esc(ann.mediaUrl)}" class="absolute inset-0 w-full h-full object-cover" alt="" />`
        : `<div class="absolute inset-0 bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center">
             <i class="fa-solid ${ann.kind === 'pdf' ? 'fa-file-pdf' : 'fa-bullhorn'} text-white text-2xl"></i>
           </div>`;
      return `
        <button data-ann="${ann.id}" class="ann-story w-[84px] flex-shrink-0 text-center touch-btn">
          <div class="relative w-[84px] h-[110px] rounded-2xl overflow-hidden ring-2 ring-orange-500 ring-offset-2 shadow">
            ${media}
            <span class="absolute bottom-1.5 left-1/2 -translate-x-1/2 bg-black/70 text-white text-[8px] font-extrabold px-1.5 py-0.5 rounded-full flex items-center gap-1">
              <i class="fa-solid fa-shield-halved"></i>Oficial
            </span>
          </div>
          <span class="block text-[10px] font-bold text-slate-700 leading-tight mt-1.5 line-clamp-2">${esc(ann.title)}</span>
        </button>`;
    }).join('');

    container.querySelectorAll('.ann-story').forEach(btn => {
      btn.addEventListener('click', () => onOpenAnn(btn.dataset.ann));
    });
  },

  // Cuerpo del modal "historia" para un comunicado
  renderAnnStoryModal(ann) {
    const content = document.getElementById('annStoryContent');
    if (!content) return;
    const fecha = ann.createdAt ? new Date(ann.createdAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const cover = ann.kind === 'image' && ann.mediaUrl
      ? `<div class="relative h-56 flex-shrink-0 bg-slate-900">
           <img src="${esc(ann.mediaUrl)}" class="w-full h-full object-cover" alt="${esc(ann.title)}" />
           <span class="absolute top-3 left-3 bg-slate-900/80 text-white text-[9px] font-extrabold px-2 py-1 rounded-full">🛡️ Oficial Mz ${esc(ann.manzana)}</span>
         </div>`
      : `<div class="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 flex-shrink-0">
           <span class="text-[9px] font-extrabold uppercase tracking-wider text-orange-400">Comunicado oficial · Mz ${esc(ann.manzana)}</span>
           <div class="text-3xl mt-2"><i class="fa-solid ${ann.kind === 'pdf' ? 'fa-file-pdf' : 'fa-bullhorn'}"></i></div>
         </div>`;
    const body = ann.kind === 'pdf' && ann.mediaUrl
      ? `<div class="rounded-xl bg-red-50 border border-red-100 p-3 text-xs text-red-700">
           <p class="font-extrabold mb-1">📄 Documento adjunto</p>
           <a href="${esc(ann.mediaUrl)}" target="_blank" rel="noopener" class="text-orange-600 font-bold underline">Abrir PDF →</a>
         </div>`
      : '';

    content.innerHTML = `
      ${cover}
      <div class="overflow-y-auto flex-1 p-5 space-y-3">
        <h3 class="font-extrabold text-lg text-slate-900 leading-tight">${esc(ann.title)}</h3>
        ${body}
        ${ann.body ? `<p class="text-sm text-slate-600 leading-relaxed whitespace-pre-line">${esc(ann.body)}</p>` : ''}
      </div>
      <div class="p-4 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
        <span><i class="fa-solid fa-calendar mr-1"></i>${fecha}</span>
        <span class="font-extrabold text-orange-600 uppercase">Vitrina Digital</span>
      </div>`;
  },

  // Renderizar el recibo digital oficial con diseño estético y botón de descarga
  renderDigitalReceipt(receipt, containerId = 'receiptDetailContainer') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const fromDate = new Date(receipt.coverageStartDate).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    const toDate = new Date(receipt.coverageEndDate).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

    container.innerHTML = `
      <div id="printableReceiptArea" class="receipt-paper p-4 text-slate-800 space-y-3 border-2 border-dashed border-orange-300 rounded-2xl bg-white shadow-md">
        
        <!-- Cabecera del recibo -->
        <div class="text-center pb-2.5 border-b border-slate-200">
          <div class="w-10 h-10 mx-auto rounded-xl bg-orange-500/10 text-orange-600 flex items-center justify-center text-xl mb-1">
            🍊
          </div>
          <h3 class="text-sm font-extrabold text-slate-900 leading-tight">Vitrina Digital Los Naranjos</h3>
          <p class="text-[10px] text-slate-500 font-medium">Jamundí • Factura Oficial de Activación</p>
          <div class="mt-2 inline-block bg-emerald-50 border border-emerald-500/40 text-emerald-700 font-extrabold px-2.5 py-0.5 rounded-full text-[10px]">
            ✓ PAGO APROBADO & VIGENTE
          </div>
        </div>

        <!-- Datos Principales -->
        <div class="space-y-1.5 text-[11px]">
          <div class="flex justify-between">
            <span class="text-slate-400">Recibo N°:</span>
            <span class="font-mono font-bold text-slate-800">${receipt.receiptId}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Transacción:</span>
            <span class="font-mono font-bold text-slate-700 text-[10px]">${receipt.transactionId}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Emprendimiento:</span>
            <span class="font-bold text-orange-600 truncate max-w-[170px] text-right">${receipt.businessName} (Mz ${receipt.manzana})</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Medio de Pago:</span>
            <span class="font-bold text-slate-800">${receipt.paymentMethod}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Vigencia Activa:</span>
            <span class="font-bold text-emerald-700">${fromDate} al ${toDate}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Duración:</span>
            <span class="font-bold text-slate-800">30 Días Calendario</span>
          </div>
        </div>

        <!-- Total Pagado -->
        <div class="pt-2.5 border-t border-dashed border-slate-300 flex justify-between items-baseline">
          <span class="font-bold text-xs text-slate-600">Total Mensualidad:</span>
          <span class="text-lg font-extrabold text-slate-900 font-mono">$${receipt.amountCOP.toLocaleString('es-CO')} <span class="text-[10px] font-normal text-slate-500">COP</span></span>
        </div>

        <!-- Código de Verificación -->
        <div class="bg-slate-50 p-2 rounded-xl text-center text-[10px] text-slate-500 font-mono">
          Código de Verificación: <strong class="text-slate-800">${receipt.verificationCode}</strong>
        </div>

      </div>
    `;
  }
};
