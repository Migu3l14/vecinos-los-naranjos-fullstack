// Módulo de comunicación con el Backend REST API
const API_BASE = '/api';

// Tokens de sesión en MEMORIA (nunca se persisten en localStorage).
// La sesión persistente y segura viaja en la cookie httpOnly que pone el servidor,
// lo que la hace invisible para scripts maliciosos (protección anti-XSS).
let memResidentToken = '';
let memAdminToken = '';

export const API = {
  // Obtener categorías
  async getCategories() {
    try {
      const res = await fetch(`${API_BASE}/categories`);
      const data = await res.json();
      return data.data || [];
    } catch (error) {
      console.error('Error al obtener categorías:', error);
      return [];
    }
  },

  // Obtener ofertas activas
  async getOffers() {
    try {
      const res = await fetch(`${API_BASE}/offers`);
      const data = await res.json();
      return data.data || [];
    } catch (error) {
      console.error('Error al obtener ofertas:', error);
      return [];
    }
  },

  // ============================================================
  // PÚBLICO / PORTADA: estadísticas y soporte
  // ============================================================
  async getStats() {
    try {
      const res = await fetch(`${API_BASE}/stats`);
      const data = await res.json();
      return data.data || null;
    } catch (error) {
      console.error('Error al obtener estadísticas:', error);
      return null;
    }
  },

  // Registra una visita (el frontend hace dedupe por día y sesión)
  async registerVisit() {
    try {
      await fetch(`${API_BASE}/stats/visit`, { method: 'POST' });
    } catch (e) {
      console.error('Error al registrar visita:', e);
    }
  },

  // Canales de soporte configurados (WhatsApp y/o email)
  async getSupport() {
    try {
      const res = await fetch(`${API_BASE}/support`);
      const data = await res.json();
      return data.data || { whatsapp: '', email: '' };
    } catch (error) {
      console.error('Error al obtener soporte:', error);
      return { whatsapp: '', email: '' };
    }
  },

  // POST /api/support/request — el emprendedor deja su número para que lo contacten
  async submitSupportRequest({ telefono, mensaje }) {
    try {
      const res = await fetch(`${API_BASE}/support/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefono, mensaje })
      });
      return await res.json();
    } catch (error) {
      console.error('Error al enviar solicitud de soporte:', error);
      return { success: false, message: 'No se pudo enviar la solicitud.' };
    }
  },

  // GET /api/support/requests (admin) — solicitudes para contactar al emprendedor
  async getSupportRequests() {
    return this.fetchAdmin(`${API_BASE}/support/requests`);
  },

  // Subir una imagen (JPG/PNG/WebP, máx. 5MB) → devuelve { data: { url } }
  async uploadImage(file) {
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch(`${API_BASE}/uploads`, { method: 'POST', body: fd });
      return await res.json();
    } catch (error) {
      console.error('Error al subir imagen:', error);
      return { success: false, message: 'Error de conexión al subir la imagen.' };
    }
  },

  // Subir adjunto de comunicado (imagen o PDF) → { data: { url, kind } }
  async uploadAnnouncementDoc(file) {
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API_BASE}/uploads/document`, { method: 'POST', body: fd });
      return await res.json();
    } catch (error) {
      console.error('Error al subir adjunto:', error);
      return { success: false, message: 'Error de conexión al subir el adjunto.' };
    }
  },

  // ============================================================
  // COMUNICADOS OFICIALES POR MANZANA
  // ============================================================

  // GET /api/announcements?manzana=N (público)
  async getAnnouncements(manzana = 'all') {
    try {
      const res = await fetch(`${API_BASE}/announcements?manzana=${encodeURIComponent(manzana)}`);
      const data = await res.json();
      return data.data || [];
    } catch (error) {
      console.error('Error al consultar comunicados:', error);
      return [];
    }
  },

  // GET /api/announcements/admin (admin — solo su manzana)
  async getAdminAnnouncements() {
    return this.fetchAdmin(`${API_BASE}/announcements/admin`);
  },

  // GET /api/announcements/recipients/count?manzana=N (admin) — preview destinatarios
  async getAnnouncementRecipients(manzana) {
    try {
      return await this.fetchAdmin(`${API_BASE}/announcements/recipients/count?manzana=${encodeURIComponent(manzana)}`);
    } catch (error) {
      return { success: false, data: { count: 0 }, message: error.message };
    }
  },

  // POST /api/announcements (admin) — publicar { manzana, title, body, mediaUrl, kind, sendWhatsApp }
  async createAnnouncement(data) {
    try {
      return await this.fetchAdmin(`${API_BASE}/announcements`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    } catch (error) {
      return { success: false, message: error.message };
    }
  },

  // DELETE /api/announcements/:id (admin)
  async deleteAnnouncement(id) {
    try {
      return await this.fetchAdmin(`${API_BASE}/announcements/${id}`, { method: 'DELETE' });
    } catch (error) {
      return { success: false, message: error.message };
    }
  },

  // POST /api/announcements/:id/broadcast (admin) — reenviar por WhatsApp
  async broadcastAnnouncement(id) {
    try {
      return await this.fetchAdmin(`${API_BASE}/announcements/${id}/broadcast`, { method: 'POST' });
    } catch (error) {
      return { success: false, message: error.message };
    }
  },

  // Obtener vitrinas con filtros
  async getBusinesses(params = {}) {
    try {
      const query = new URLSearchParams(params).toString();
      const res = await fetch(`${API_BASE}/businesses?${query}`);
      const data = await res.json();
      return data.data || [];
    } catch (error) {
      console.error('Error al consultar vitrinas:', error);
      return [];
    }
  },

  // Obtener detalle de una vitrina específica
  async getBusinessById(id) {
    try {
      const res = await fetch(`${API_BASE}/businesses/${id}`);
      const data = await res.json();
      return data.data || null;
    } catch (error) {
      console.error('Error al obtener vitrina:', error);
      return null;
    }
  },

  // POST /api/businesses/:id/ratings — Un cliente valora la vitrina (1 a 5 estrellas)
  async rateBusiness(businessId, payload) {
    try {
      const res = await fetch(`${API_BASE}/businesses/${businessId}/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (error) {
      console.error('Error al valorar vitrina:', error);
      return { success: false, message: 'Error de conexión al guardar la valoración.' };
    }
  },

  // Registrar nueva vitrina (Paso 1 del Onboarding).
  // Si hay sesión de residente, envía el token para vincular la vitrina a la cuenta
  // (modelo único Residente/Vendedor).
  async registerBusiness(businessData) {
    try {
      const token = this.getResidentToken();
      const res = await fetch(`${API_BASE}/businesses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(businessData)
      });
      return await res.json();
    } catch (error) {
      console.error('Error al registrar vitrina:', error);
      return { success: false, message: 'Error de conexión con el servidor.' };
    }
  },

  // Procesar Pago y Activar por 30 Días (Paso 2 del Onboarding o Renovación)
  async processPayment(paymentPayload) {
    try {
      const res = await fetch(`${API_BASE}/subscriptions/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentPayload)
      });
      return await res.json();
    } catch (error) {
      console.error('Error al procesar pago:', error);
      return { success: false, message: 'Error de conexión al procesar el pago.' };
    }
  },

  // Buscar vitrina por número de WhatsApp para consultar vigencia o renovar
  async getBusinessByPhone(phone) {
    try {
      const res = await fetch(`${API_BASE}/businesses/manage/${phone}`);
      return await res.json();
    } catch (error) {
      console.error('Error al buscar vitrina por teléfono:', error);
      return { success: false, message: 'Error al consultar.' };
    }
  },

  // Obtener recibo digital
  async getReceipt(receiptId) {
    try {
      const res = await fetch(`${API_BASE}/subscriptions/receipt/${receiptId}`);
      const data = await res.json();
      return data.data || null;
    } catch (error) {
      console.error('Error al obtener recibo:', error);
      return null;
    }
  },

  // Preparar una transacción Wompi para el Widget Checkout
  async wompiCheckout(payload) {
    try {
      const res = await fetch(`${API_BASE}/payments/wompi-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (error) {
      console.error('Error al preparar pago Wompi:', error);
      return { success: false, message: 'Error de conexión.' };
    }
  },

  // Consultar el estado de una transacción (pago) en tiempo real
  async getPaymentTransaction(transactionId) {
    try {
      const res = await fetch(`${API_BASE}/payments/transaction/${transactionId}`);
      const data = await res.json();
      return data.data || null;
    } catch (error) {
      console.error('Error al consultar transacción:', error);
      return null;
    }
  },

  // Obtener el recibo más reciente de un negocio (tras pago aprobado)
  async getReceiptByBusiness(businessId) {
    try {
      const res = await fetch(`${API_BASE}/payments/receipt-by-business/${businessId}`);
      const data = await res.json();
      return data.data || null;
    } catch (error) {
      console.error('Error al obtener recibo por negocio:', error);
      return null;
    }
  },

  // ============================================================
  // AUTH: ADMIN, RESIDENTE e INVITADO
  // ============================================================

  // ---- Acceso de administración por manzana: teléfono + código OTP ----

  // POST /api/auth/admin/otp/request — solicita el código para el teléfono de administración
  async requestAdminOtp(phone) {
    try {
      const res = await fetch(`${API_BASE}/auth/admin/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      return await res.json();
    } catch (error) {
      console.error('Error al solicitar código admin:', error);
      return { success: false, message: 'Error de conexión.' };
    }
  },

  // POST /api/auth/admin/otp/verify — verifica y guarda la sesión del administrador
  async verifyAdminOtp(phone, code) {
    try {
      const res = await fetch(`${API_BASE}/auth/admin/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code })
      });
      const data = await res.json();
      if (data.success) {
        memAdminToken = data.data.token || '';
        localStorage.setItem('adminToken', memAdminToken);
        localStorage.setItem('adminPhone', data.data.phone || '');
        localStorage.setItem('adminManzana', data.data.manzana || '');
      }
      return data;
    } catch (error) {
      console.error('Error en login admin:', error);
      return { success: false, message: 'Error de conexión.' };
    }
  },

  getAdminToken() {
    return memAdminToken || localStorage.getItem('adminToken') || '';
  },

  logoutAdmin() {
    memAdminToken = '';
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminPhone');
    localStorage.removeItem('adminManzana');
    this.clearSessionCookieRemote();
  },

  async fetchAdmin(url, options = {}) {
    const token = this.getAdminToken();
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
    if (res.status === 401) {
      this.logoutAdmin();
      throw new Error('Sesión de administrador expirada.');
    }
    return res.json();
  },

  // Notifica al servidor para borrar la cookie httpOnly (fire-and-forget)
  clearSessionCookieRemote() {
    try {
      fetch(`${API_BASE}/auth/logout`, { method: 'POST' }).catch(() => {});
    } catch (e) { /* sin acción */ }
  },

  // Estructura del conjunto (torres para selectores)
  async getTowers() {
    try {
      const res = await fetch(`${API_BASE}/auth/towers`);
      const data = await res.json();
      return data.data || null;
    } catch (error) {
      console.error('Error al obtener torres:', error);
      return null;
    }
  },

  // Validar torre/apartamento en el servidor
  async validateApartment(tower, apartment) {
    try {
      const res = await fetch(`${API_BASE}/auth/validate-apartment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tower, apartment })
      });
      return await res.json();
    } catch (error) {
      return { success: false, message: 'Error de conexión.' };
    }
  },

  // Registro de residente con contraseña (opción "crear cuenta")
  async registerResident(data) {
    try {
      const res = await fetch(`${API_BASE}/auth/resident/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      if (json.success && json.data && json.data.token) {
        memResidentToken = json.data.token;
        localStorage.setItem('residentProfile', JSON.stringify(json.data.resident));
      }
      return json;
    } catch (error) {
      console.error('Error al registrar residente:', error);
      return { success: false, message: 'Error de conexión.' };
    }
  },

  // Login de residente (devuelve perfil para autocompletar)
  async residentLogin(phone, password) {
    try {
      const res = await fetch(`${API_BASE}/auth/resident/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password })
      });
      const json = await res.json();
      if (json.success && json.data && json.data.token) {
        memResidentToken = json.data.token;
        localStorage.setItem('residentProfile', JSON.stringify(json.data.resident));
      }
      return json;
    } catch (error) {
      console.error('Error en resident login:', error);
      return { success: false, message: 'Error de conexión.' };
    }
  },

  // Verificación por código (OTP): solicita el código para el panel "Mi Vitrina"
  async requestOtp(phone) {
    try {
      const res = await fetch(`${API_BASE}/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      return await res.json();
    } catch (error) {
      console.error('Error al solicitar código:', error);
      return { success: false, message: 'Error de conexión.' };
    }
  },

  // Verificación por código (OTP): valida el código y abre la sesión del vendedor
  async verifyOtp(phone, code) {
    try {
      const res = await fetch(`${API_BASE}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code })
      });
      const json = await res.json();
      if (json.success && json.data && json.data.token) {
        memResidentToken = json.data.token;
        localStorage.setItem('residentProfile', JSON.stringify(json.data.resident));
      }
      return json;
    } catch (error) {
      console.error('Error al verificar código:', error);
      return { success: false, message: 'Error de conexión.' };
    }
  },

  // Checkout como invitado (sin contraseña) — guarda identidad, emite sesión y devuelve datos
  async guestCheckout(data) {
    try {
      const res = await fetch(`${API_BASE}/auth/guest/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      if (json.success && json.data) {
        localStorage.setItem('residentProfile', JSON.stringify(json.data.resident));
        if (json.data.token) {
          memResidentToken = json.data.token;
        }
      }
      return json;
    } catch (error) {
      console.error('Error en guest checkout:', error);
      return { success: false, message: 'Error de conexión.' };
    }
  },

  getStoredResidentProfile() {
    try {
      return JSON.parse(localStorage.getItem('residentProfile') || 'null');
    } catch (error) {
      return null;
    }
  },

  // Ingreso rápido por QR/enlace: guarda rol y datos de la comunidad, emite sesión
  async communityEntry(data) {
    try {
      const res = await fetch(`${API_BASE}/auth/entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      if (json.success && json.data) {
        localStorage.setItem('residentProfile', JSON.stringify(json.data.resident));
        if (json.data.token) {
          memResidentToken = json.data.token;
        }
      }
      return json;
    } catch (error) {
      console.error('Error en ingreso por QR:', error);
      return { success: false, message: 'Error de conexión.' };
    }
  },

  logoutResident() {
    memResidentToken = '';
    localStorage.removeItem('residentToken');
    localStorage.removeItem('residentProfile');
    this.clearSessionCookieRemote();
  },

  getResidentToken() {
    return memResidentToken || localStorage.getItem('residentToken') || '';
  },

  isResidentLoggedIn() {
    return !!this.getResidentToken() || !!localStorage.getItem('residentProfile');
  },

  // Indica si existe cualquier sesión activa (admin o residente) para validar en el servidor
  hasAnySession() {
    return this.isResidentLoggedIn() || !!localStorage.getItem('adminPhone') || !!this.getAdminToken();
  },

  async fetchResident(url, options = {}) {
    const token = this.getResidentToken();
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
    if (res.status === 401) {
      this.logoutResident();
      throw new Error('Sesión de residente expirada.');
    }
    return res.json();
  },

  // Valida la sesión en el servidor (rol admin o residente) y devuelve perfil.
  async getMe() {
    try {
      const token = this.getResidentToken() || this.getAdminToken();
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });
      if (res.status === 401) return null;
      const json = await res.json();
      if (!json.success) return null;
      return json.data || null;
    } catch (error) {
      console.error('Error al validar sesión:', error);
      return null;
    }
  },

  // ============================================================
  // MI VITRINA (Panel del Vendedor)
  // ============================================================

  // GET /api/businesses/mine — Mis vitrinas
  async getMyBusinesses() {
    try {
      const data = await this.fetchResident(`${API_BASE}/businesses/mine`);
      return data.data || [];
    } catch (error) {
      console.error('Error al obtener mis vitrinas:', error);
      return [];
    }
  },

  // PUT /api/businesses/mine/:id — Editar perfil de mi vitrina
  async updateMyBusiness(id, data) {
    try {
      return await this.fetchResident(`${API_BASE}/businesses/mine/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    } catch (error) {
      console.error('Error al actualizar mi vitrina:', error);
      return { success: false, message: 'Error de conexión.' };
    }
  },

  // POST /api/businesses/mine/:id/products — Agregar producto
  async addMyProduct(id, data) {
    try {
      return await this.fetchResident(`${API_BASE}/businesses/mine/${id}/products`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    } catch (error) {
      console.error('Error al agregar producto:', error);
      return { success: false, message: 'Error de conexión.' };
    }
  },

  // PUT /api/businesses/mine/:id/products/:pid — Editar producto
  async updateMyProduct(id, pid, data) {
    try {
      return await this.fetchResident(`${API_BASE}/businesses/mine/${id}/products/${pid}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    } catch (error) {
      console.error('Error al actualizar producto:', error);
      return { success: false, message: 'Error de conexión.' };
    }
  },

  // DELETE /api/businesses/mine/:id/products/:pid — Eliminar producto
  async deleteMyProduct(id, pid) {
    try {
      return await this.fetchResident(`${API_BASE}/businesses/mine/${id}/products/${pid}`, {
        method: 'DELETE'
      });
    } catch (error) {
      console.error('Error al eliminar producto:', error);
      return { success: false, message: 'Error de conexión.' };
    }
  },

  // GET /api/offers/mine — listar ofertas de mi vitrina (cualquier estado)
  async getMyOffers() {
    try {
      return await this.fetchResident(`${API_BASE}/offers/mine`);
    } catch (error) {
      console.error('Error al obtener mis ofertas:', error);
      return { success: false, data: [] };
    }
  },

  // POST /api/offers — crear oferta para mi vitrina
  async createOffer(data) {
    try {
      return await this.fetchResident(`${API_BASE}/offers`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    } catch (error) {
      console.error('Error al crear oferta:', error);
      return { success: false, message: 'Error de conexión.' };
    }
  },

  // PUT /api/offers/:id — editar oferta propia
  async updateOffer(id, data) {
    try {
      return await this.fetchResident(`${API_BASE}/offers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    } catch (error) {
      console.error('Error al actualizar oferta:', error);
      return { success: false, message: 'Error de conexión.' };
    }
  },

  // PUT /api/offers/:id/status — activar/desactivar oferta propia
  async toggleOfferStatus(id, status) {
    try {
      return await this.fetchResident(`${API_BASE}/offers/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status })
      });
    } catch (error) {
      console.error('Error al cambiar estado de oferta:', error);
      return { success: false, message: 'Error de conexión.' };
    }
  },

  // DELETE /api/offers/:id — eliminar oferta propia
  async deleteOffer(id) {
    try {
      return await this.fetchResident(`${API_BASE}/offers/${id}`, {
        method: 'DELETE'
      });
    } catch (error) {
      console.error('Error al eliminar oferta:', error);
      return { success: false, message: 'Error de conexión.' };
    }
  },

  // ============================================================
  // PEDIDOS (checkout dual → siempre crea order)
  // ============================================================
  async createOrder(payload) {
    try {
      const res = await fetch(`${API_BASE}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (error) {
      console.error('Error al crear pedido:', error);
      return { success: false, message: 'Error de conexión.' };
    }
  },

  async getOrders() {
    return this.fetchAdmin(`${API_BASE}/orders`);
  },

  async updateOrderStatus(id, estado) {
    return this.fetchAdmin(`${API_BASE}/orders/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ estado })
    });
  },

  // ============================================================
  // PQRS
  // ============================================================
  async sendPqrs(data) {
    try {
      const res = await fetch(`${API_BASE}/pqrs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (error) {
      console.error('Error al radicar PQRS:', error);
      return { success: false, message: 'Error de conexión.' };
    }
  },

  async getPqrs(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    return this.fetchAdmin(`${API_BASE}/pqrs?${query}`);
  },

  async updatePqrsStatus(id, estado) {
    return this.fetchAdmin(`${API_BASE}/pqrs/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ estado })
    });
  },

  async addPqrsNote(id, nota) {
    return this.fetchAdmin(`${API_BASE}/pqrs/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ nota })
    });
  },

  // ============================================================
  // ADMIN CRUD de VITRINAS
  // ============================================================
  async adminUpdateBusiness(id, data) {
    return this.fetchAdmin(`${API_BASE}/businesses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async adminDeleteBusiness(id) {
    return this.fetchAdmin(`${API_BASE}/businesses/${id}`, {
      method: 'DELETE'
    });
  }
};
