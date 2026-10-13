"use strict";

// ============================================================
//  Demo Calidad del Software — Sesión 9
//  Cypress · E2E · API Contracts
//  Página aislada: no llama a la API real (el recorrido es simulado).
// ============================================================

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ------------------------------------------------------------
//  1) Recorrido E2E interactivo (slide 9) — mapeado a POST /api/orders
// ------------------------------------------------------------
const E2E_STEPS = [
  { id: "usuario", icon: "fa-user", title: "Usuario ingresa el pedido", detail: "Producto + identidad (nombre, teléfono, torre, apartamento, dirección)." },
  { id: "frontend", icon: "fa-mobile-screen-button", title: "Frontend valida y envía", detail: "Comprueba campos y hace POST /api/orders." },
  { id: "api", icon: "fa-server", title: "API procesa la solicitud", detail: "Valida businessId, productos y datos del residente." },
  { id: "db", icon: "fa-database", title: "Base de datos persiste", detail: "Guarda el pedido (orders.json en dev / Redis en prod)." },
  { id: "respuesta", icon: "fa-circle-check", title: "Respuesta: la UI confirma", detail: "201 Created con orderId (ORD-…) y estado 'Recibido'." },
];

function pintarPasos() {
  const cont = $("e2eSteps");
  cont.innerHTML = "";
  E2E_STEPS.forEach((step, i) => {
    const card = document.createElement("div");
    card.id = `step-${step.id}`;
    card.className = "step-card flex items-center gap-3 border border-slate-200 rounded-xl px-3 py-2.5 bg-white";

    const icono = document.createElement("span");
    icono.className = "w-8 h-8 rounded-lg grid place-items-center bg-slate-100 text-slate-500 shrink-0";
    icono.innerHTML = `<i class="fa-solid ${step.icon}"></i>`;

    const texto = document.createElement("div");
    texto.className = "min-w-0";
    const t = document.createElement("p");
    t.className = "text-sm font-semibold text-slate-700";
    t.textContent = `${i + 1}. ${step.title}`;
    const d = document.createElement("p");
    d.className = "text-xs text-slate-400";
    d.textContent = step.detail;
    texto.append(t, d);

    const check = document.createElement("span");
    check.className = "ml-auto text-slate-300 shrink-0";
    check.innerHTML = '<i class="fa-solid fa-circle-notch"></i>';

    card.append(icono, texto, check);
    cont.appendChild(card);
  });
}

function resetPasos() {
  pintarPasos();
  const log = $("e2eLog");
  log.innerHTML = "";
  const vacio = document.createElement("p");
  vacio.id = "e2eLogEmpty";
  vacio.className = "text-sm text-slate-400 italic";
  vacio.textContent = "Aún no se ha ejecutado el recorrido.";
  log.appendChild(vacio);
}

function logE2E(mensaje, tipo) {
  $("e2eLogEmpty")?.remove();
  const fila = document.createElement("div");
  fila.className =
    "log-row flex items-center gap-2 px-3 py-2 rounded-xl text-sm border " +
    (tipo === "pass" ? "bg-emerald-50 border-emerald-100 text-emerald-700" :
     tipo === "fail" ? "bg-rose-50 border-rose-100 text-rose-700" :
     "bg-slate-50 border-slate-200 text-slate-600");

  const icono = document.createElement("i");
  icono.className =
    tipo === "pass" ? "fa-solid fa-circle-check" :
    tipo === "fail" ? "fa-solid fa-circle-xmark" : "fa-solid fa-circle-notch";

  const span = document.createElement("span");
  icono.className += " shrink-0";
  const texto = document.createElement("span");
  texto.textContent = mensaje;

  fila.append(icono, texto);
  $("e2eLog").prepend(fila);
}

async function ejecutarE2E() {
  resetPasos();
  $("btnRunE2E").disabled = true;
  const simularFallo = $("chkFail").checked;

  let detenido = false;
  for (const step of E2E_STEPS) {
    const card = $(`step-${step.id}`);
    card.classList.add("step-running");
    logE2E(`Ejecutando: ${step.title}…`, "run");
    await sleep(700);

    const falla = simularFallo && step.id === "api";
    card.classList.remove("step-running");

    if (falla) {
      card.classList.add("step-fail");
      card.querySelector("span:last-child").innerHTML = '<i class="fa-solid fa-circle-xmark text-rose-500"></i>';
      logE2E(`FALLÓ en "${step.title}" → 500. La prueba E2E detecta el error y frena.`, "fail");
      break;
    }

    card.classList.add("step-pass");
    card.querySelector("span:last-child").innerHTML = '<i class="fa-solid fa-circle-check text-emerald-500"></i>';
    logE2E(`OK: ${step.title}`, "pass");
    await sleep(180);
  }

  logE2E($("chkFail").checked && $("step-api")?.classList.contains("step-fail")
    ? "Recorrido terminado con 1 fallo detectado."
    : "Recorrido E2E completado: pedido creado (estado 'Recibido').", $("step-api")?.classList.contains("step-fail") ? "fail" : "pass");

  $("e2eLog").firstChild?.scrollIntoView?.({ block: "nearest" });
}

// ------------------------------------------------------------
//  2) Validador de contrato de API (slides 12–13)
// ------------------------------------------------------------
const RESPONSES = {
  valid: {
    success: true,
    data: { orderId: "ORD-123456", businessId: "biz_42", estado: "Recibido", products: [{ name: "Cafe", qty: 2 }], resident: { fullName: "Ana" } },
  },
  badId: {
    success: true,
    data: { orderId: "order-123", businessId: "biz_42", estado: "Recibido", products: [{ name: "Cafe", qty: 2 }], resident: { fullName: "Ana" } },
  },
  badEstado: {
    success: true,
    data: { orderId: "ORD-123456", businessId: "biz_42", estado: "Pendiente", products: [{ name: "Cafe", qty: 2 }], resident: { fullName: "Ana" } },
  },
  missingResident: {
    success: true,
    data: { orderId: "ORD-123456", businessId: "biz_42", estado: "Recibido", products: [{ name: "Cafe", qty: 2 }] },
  },
};

const ESTADOS_VALIDOS = ["Recibido", "En Preparación", "En Camino", "Entregado", "Cancelado"];

function getPath(obj, path) {
  return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function validarContrato(respuesta) {
  const errores = [];

  if (respuesta.success !== true) errores.push("`success` debe ser true.");

  const data = respuesta.data;
  if (!data || typeof data !== "object") {
    errores.push("`data` debe ser un objeto.");
    return errores;
  }

  if (typeof data.orderId !== "string" || !/^ORD-\d{3,}$/.test(data.orderId))
    errores.push(`\`orderId\` debe cumplir /^ORD-\\d{3,}$/ (recibido: "${data.orderId}").`);

  if (typeof data.businessId !== "string" || !data.businessId)
    errores.push("`businessId` es obligatorio (string no vacío).");

  if (!ESTADOS_VALIDOS.includes(data.estado))
    errores.push(`\`estado\` debe ser uno de: ${ESTADOS_VALIDOS.join(", ")} (recibido: "${data.estado}").`);

  if (!Array.isArray(data.products) || data.products.length === 0)
    errores.push("`products` debe ser un arreglo con al menos 1 elemento.");

  if (!data.resident || typeof data.resident !== "object")
    errores.push("`resident` es obligatorio (objeto).");

  return errores;
}

function mostrarResultadoContrato() {
  const key = $("sampleSelect").value;
  const respuesta = RESPONSES[key];
  const errores = validarContrato(respuesta);
  const cont = $("contractResult");
  cont.innerHTML = "";

  if (errores.length === 0) {
    const ok = document.createElement("div");
    ok.className = "rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 px-3 py-2 font-semibold";
    ok.innerHTML = '<i class="fa-solid fa-circle-check mr-1"></i> Contrato válido: la respuesta cumple lo esperado.';
    cont.appendChild(ok);
    return;
  }

  const titulo = document.createElement("p");
  titulo.className = "font-semibold text-rose-700 mb-1";
  titulo.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1"></i> Contrato incumplido (${errores.length}):`;
  cont.appendChild(titulo);

  const lista = document.createElement("ul");
  lista.className = "list-disc list-inside text-rose-600 space-y-1";
  errores.forEach((e) => {
    const li = document.createElement("li");
    li.textContent = e;
    lista.appendChild(li);
  });
  cont.appendChild(lista);
}

// ------------------------------------------------------------
//  3) Tabla de la actividad (slide 18)
// ------------------------------------------------------------
const FILA_EJEMPLO = [
  "Residente crea un pedido en una vitrina activa",
  "Vitrina activa con businessId válido; residente con datos completos (nombre, teléfono, torre, apto, dirección).",
  "1) Abrir la vitrina  2) Agregar un producto  3) Ingresar identidad  4) Confirmar → POST /api/orders",
  "201 Created; pedido con orderId (ORD-…) y estado 'Recibido'.",
  "E2E (UI + API)",
];

function crearFila(valores = ["", "", "", "", ""]) {
  const tr = document.createElement("tr");

  valores.forEach((valor) => {
    const td = document.createElement("td");
    td.className = "border border-slate-200 p-1.5 align-top";
    const campo = document.createElement("textarea");
    campo.rows = 3;
    campo.value = valor;
    campo.placeholder = "…";
    td.appendChild(campo);
    tr.appendChild(td);
  });

  const tdAccion = document.createElement("td");
  tdAccion.className = "border border-slate-200 p-1.5 align-top text-center";
  const btn = document.createElement("button");
  btn.className = "text-slate-400 hover:text-rose-600";
  btn.title = "Eliminar fila";
  btn.innerHTML = '<i class="fa-solid fa-trash"></i>';
  btn.addEventListener("click", () => tr.remove());
  tdAccion.appendChild(btn);
  tr.appendChild(tdAccion);

  return tr;
}

function pintarTabla() {
  const body = $("activityBody");
  body.innerHTML = "";
  body.appendChild(crearFila(FILA_EJEMPLO));
  body.appendChild(crearFila());
  body.appendChild(crearFila());
}

// ------------------------------------------------------------
//  Inicialización
// ------------------------------------------------------------
pintarPasos();
$("btnRunE2E").addEventListener("click", ejecutarE2E);
$("btnResetE2E").addEventListener("click", resetPasos);
$("btnValidate").addEventListener("click", mostrarResultadoContrato);
$("btnAddRow").addEventListener("click", () => $("activityBody").appendChild(crearFila()));
$("btnPrint").addEventListener("click", () => window.print());
pintarTabla();
