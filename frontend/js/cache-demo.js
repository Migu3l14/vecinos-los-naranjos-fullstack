"use strict";

// ============================================================
//  Demo de caché (Cache-Aside) — Sesión 8, Desempeño en APIs REST
//  Caché en memoria del navegador. La petición al servidor está
//  simulada para reproducir el ejemplo de la clase.
// ============================================================

// Latencia simulada (ms) por endpoint: imita una consulta costosa.
const LATENCIAS = {
  "/api/productos": 800,
  "/api/vitrinas": 650,
  "/api/comunicados": 450,
};

// Caché en memoria: vive solo mientras la página está abierta.
const cache = new Map();

// Tiempos observados (ms), para calcular los promedios MISS/HIT.
const tiemposMiss = [];
const tiemposHit = [];

const $ = (id) => document.getElementById(id);
const ahora = () => Date.now();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Simula la petición "real" y costosa al servidor.
async function peticionReal(endpoint) {
  await sleep(LATENCIAS[endpoint] ?? 600);
  return {
    endpoint,
    data: {
      mensaje: `Respuesta de ${endpoint}`,
      negocios: Math.floor(Math.random() * 20) + 1,
    },
    fetchedAt: new Date().toLocaleTimeString(),
  };
}

// Cache-Aside: igual a la función de la diapositiva.
async function peticionConCache(endpoint, ttl) {
  const entrada = cache.get(endpoint);
  if (entrada && entrada.expiresAt > ahora()) {
    return { ...entrada.value, status: "HIT" };
  }
  const resultado = await peticionReal(endpoint);
  cache.set(endpoint, { value: resultado, expiresAt: ahora() + ttl * 1000 });
  return { ...resultado, status: "MISS" };
}

// Ejecuta una petición, mide el tiempo y actualiza la interfaz.
async function ejecutar() {
  const endpoint = $("endpoint").value;
  const ttl = Math.max(1, Number($("ttl").value) || 30);

  const t0 = performance.now();
  const resultado = await peticionConCache(endpoint, ttl);
  const ms = performance.now() - t0;

  if (resultado.status === "MISS") {
    tiemposMiss.push(ms);
  } else {
    tiemposHit.push(ms);
  }

  agregarRegistro(endpoint, resultado.status, ms);
  renderStats();
}

async function ejecutarTres() {
  for (let i = 0; i < 3; i += 1) {
    await ejecutar();
  }
}

function invalidar() {
  const endpoint = $("endpoint").value;
  const existia = cache.delete(endpoint);
  agregarAviso(
    existia
      ? `Caché invalidado para ${endpoint}. La próxima petición será MISS.`
      : `${endpoint} no estaba en caché.`
  );
  renderStats();
}

function limpiar() {
  cache.clear();
  tiemposMiss.length = 0;
  tiemposHit.length = 0;
  const log = $("log");
  log.innerHTML = "";
  const vacio = document.createElement("p");
  vacio.id = "logEmpty";
  vacio.className = "text-sm text-slate-400 italic";
  vacio.textContent = 'Aún no hay peticiones. Pulsa "Hacer petición".';
  log.appendChild(vacio);
  renderStats();
}

// ---- Render -------------------------------------------------

function agregarRegistro(endpoint, status, ms) {
  $("logEmpty")?.remove();

  const esHit = status === "HIT";
  const fila = document.createElement("div");
  fila.className =
    "log-row flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-sm border " +
    (esHit ? "bg-emerald-50 border-emerald-100" : "bg-rose-50 border-rose-100");

  const izquierda = document.createElement("span");
  izquierda.className = "flex items-center gap-2 min-w-0";

  const badge = document.createElement("span");
  badge.className =
    "px-2 py-0.5 rounded-md text-[11px] font-bold " +
    (esHit ? "badge-hit" : "badge-miss");
  badge.textContent = status;

  const ruta = document.createElement("span");
  ruta.className = "mono truncate text-slate-700";
  ruta.textContent = endpoint;

  izquierda.append(badge, ruta);

  const derecha = document.createElement("span");
  derecha.className = "flex items-center gap-3 shrink-0";

  const tiempo = document.createElement("span");
  tiempo.className = "mono font-semibold " + (esHit ? "text-emerald-700" : "text-rose-700");
  tiempo.textContent = `${ms.toFixed(1)} ms`;

  const hora = document.createElement("span");
  hora.className = "text-xs text-slate-400";
  hora.textContent = new Date().toLocaleTimeString();

  derecha.append(tiempo, hora);
  fila.append(izquierda, derecha);

  $("log").prepend(fila);
}

function agregarAviso(mensaje) {
  $("logEmpty")?.remove();
  const fila = document.createElement("div");
  fila.className = "log-row flex items-center gap-2 px-3 py-2 rounded-xl text-sm bg-slate-50 border border-slate-200 text-slate-500";
  const icono = document.createElement("i");
  icono.className = "fa-solid fa-broom text-slate-400";
  const texto = document.createElement("span");
  texto.textContent = mensaje;
  fila.append(icono, texto);
  $("log").prepend(fila);
}

function promedio(valores) {
  if (!valores.length) return null;
  return valores.reduce((suma, v) => suma + v, 0) / valores.length;
}

function renderStats() {
  const miss = promedio(tiemposMiss);
  const hit = promedio(tiemposHit);

  $("statMiss").textContent = miss == null ? "—" : `${miss.toFixed(0)} ms`;
  $("statHit").textContent = hit == null ? "—" : `${hit.toFixed(1)} ms`;

  if (miss && hit != null) {
    $("statImprove").textContent = `${Math.round((1 - hit / miss) * 100)}%`;
  } else {
    $("statImprove").textContent = "—";
  }

  $("statCounts").textContent = `${tiemposHit.length} HIT / ${tiemposMiss.length} MISS`;
  $("cacheSize").textContent = String(cache.size);
}

// ---- Inicialización ----------------------------------------

$("btnRequest").addEventListener("click", ejecutar);
$("btnRequest3").addEventListener("click", ejecutarTres);
$("btnInvalidate").addEventListener("click", invalidar);
$("btnClear").addEventListener("click", limpiar);

renderStats();
