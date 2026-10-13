# AGENTS.md — Vitrina Digital Los Naranjos

> Contexto persistente para que cualquier sesión de opencode retome el proyecto
> exactamente donde quedó, incluso tras apagar el PC. **Leer esto primero.**

## Qué es
Plataforma de comercio hiperlocal para la comunidad **Los Naranjos** (Jamundí, Colombia),
con 6 manzanas. Incluye vitrinas de emprendedores, comercio con WhatsApp, pagos Wompi,
PQRS, valoraciones, comunicados oficiales por manzana ("Mi Manzana") y panel de administración.

## Repo y entorno
- **GitHub**: `https://github.com/Migu3l14/vecinos-los-naranjos-fullstack` (rama `main`).
- **Local**: `C:\Users\arago\OneDrive\Documentos\vecinos-los-naranjos-fullstack`
- **⚠️ OneDrive**: el proyecto vive en OneDrive como *Files On-Demand*. Si los archivos
  aparecen "solo nube" (atributo `O`), OneDrive debe estar abierto y sincronizando; si no,
  las lecturas y git fallan. Antes de trabajar: `git pull` (la copia local puede quedar atrás,
  GitHub es la fuente de verdad).

## Stack
- **Backend**: Node.js (ESM) + Express 4. Entry serverless: `api/index.js` (reusa `backend/app.js`).
- **Frontend**: HTML + JS vanilla + Tailwind (CDN). Archivos: `frontend/index.html`,
  `admin.html`, `mi-vitrina.html`, `recibo.html`, `cache-demo.html` y `testing-demo.html`
  (demos aisladas de las sesiones 8 y 9); lógica en `frontend/js/`.
- **Caché HTTP**: `backend/middleware/cache.js` (`cachePublic`, `noStore`) aplicado en rutas GET
  públicas. Desactivado por defecto en `/api` (no-store) y activado explícitamente donde aplica.
- **Pruebas (Cypress)**: `cypress.config.js` + `cypress/e2e/` (API de pedidos + smoke de páginas).
  Contrato de API en `openapi.yaml`. Cypress es `devDependency`; en Vercel se evita descargar su
  navegador con `CYPRESS_INSTALL_BINARY=0` (ver `vercel.json`). Los tests corren **solo en local**.
- **Persistencia**: `@upstash/redis` en producción; JSON local en `backend/data/*.json` en dev
  (capa en `backend/db/storage.js`). Subidas: `@vercel/blob` (prod) o `backend/uploads/` (dev).
- **Auth**: JWT (`jsonwebtoken`) + bcryptjs; login admin por teléfono + OTP.
- **Pagos**: Wompi (`backend/services/wompiService.js`, con verificación de firma del webhook).
- **WhatsApp**: Meta Cloud API o modo demo (`backend/services/whatsappService.js`).

## Comandos
```bash
npm start   # bootstrap de datos + servidor Express en http://localhost:4000
npm run dev # igual pero con --watch
```
Páginas: cliente `/`, admin `/admin.html`, vitrina `/mi-vitrina.html`, recibo `/recibo.html`.
Deploy: push a `main` → Vercel despliega automáticamente.

Pruebas E2E (con el servidor corriendo en `:4000`):
```bash
npm test           # o: npm run test:e2e  → Cypress headless
npm run cypress:open
```

## Estado actual (dónde quedamos)
- **HEAD / GitHub `main`: `f1580ff`** — "feat(auth): ingreso para guarda de seguridad (rol guard)".
  Copia local **sincronizada** con GitHub. (Antes: `ab19f97`, Sesión 9.)
- **Guarda de seguridad (rol `guard`), ya en `main`** — commit `f1580ff`: tercer rol "Guarda" en el
  modal de ingreso (`frontend/index.html`); al guarda solo se le pide **celular + manzana** (sin
  torre/apto). `entryGuest` (`backend/controllers/authController.js`) acepta `role: 'guard'` y omite
  `validateApartment`. Ve **solo la vitrina pública** (no accede a "Mi Manzana" privada). Panel admin
  (`frontend/js/admin.js`): contador y etiqueta "Guarda". Pruebas: `cypress/e2e/api-entry-guard.cy.js`
  (+ `cy.task('removeResident')`). Verificado: **6/6 tests pasan**.
- **Trabajo de Calidad/Pruebas (clase "Sesión 9 – Calidad del Software, Parte I"), ya en `main`:**
  - **Pruebas reales** — commit `ab19f97`: Cypress `devDependency` + `cypress.config.js`
    (`baseUrl` local), `cypress/e2e/api-orders.cy.js` (crea pedido y valida el contrato, con
    **limpieza** del pedido de prueba vía `cy.task('removeOrder')`) y `cypress/e2e/home.cy.js`
    (smoke de la app + demos). Contrato en `openapi.yaml`. Verificado: **4/4 tests pasan**.
  - **Demo (diapositivas 8, 9, 11, 13, 18)**: `frontend/testing-demo.html` + `frontend/js/testing-demo.js`
    — pirámide de pruebas, recorrido E2E animado (flujo `POST /api/orders`) y validador de contrato;
    página aislada en `/testing-demo.html` (no llama a la API real).
- **Trabajo de Caché (clase "Sesión 8 – Desempeño en APIs REST"), ya en `main`:**
  - **Fase 1 (HTTP)** — commit `16c8679`: `backend/middleware/cache.js` (`cachePublic`, `noStore`).
    GET públicos con `Cache-Control` + `s-maxage`/`stale-while-revalidate` + `ETag`/`304`.
    TTLs usados: `categories` y `auth/towers` → `3600/86400`; `businesses`, `businesses/:id`,
    `stats` → `60/300`; `offers` y `announcements` → `30/120`. Rutas con sesión quedan `no-store`
  (p. ej. `/api/auth/me`, `/api/businesses/manage/:phone`). Verificado con curl/Invoke-WebRequest.
- **Demo de caché (diapositivas 11–12)**: `frontend/cache-demo.html` + `frontend/js/cache-demo.js`
  (patrón Cache-Aside con HIT/MISS, TTL e invalidación; página aislada, no toca la API).
- Trabajo previo ya incluido: QR para compartir por WhatsApp (22 sep), flujo rol comprador/vendedor,
  10 torres por manzana, sesión persistente por celular (~1 año), header/branding/banner,
  "Mi Manzana" en acordeón, tab Residentes en admin, y los arreglos de seguridad (`d227a44`).

## Pendientes / próximos pasos (confirmar con el usuario)
- **Pruebas (futuro)**: añadir E2E de UI (Cypress con selectores `data-cy`, hoy no existen en el
  HTML real) y correr la suite en **CI (GitHub Actions)** antes del deploy. Opcional.
- Verificar que los **iconos de redes sociales (Instagram/Facebook) se vean en móvil** al abrir una vitrina.
- Configurar envío **real** de WhatsApp (llenar `WHATSAPP_API_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`).
- **Migración final a GoDaddy** (hosting + base de datos real con negocios reales). Pospuesto.
- Posible **ADMINISTRADOR_GENERAL** (superusuario) que gestione todas las manzanas; hoy solo
  existen admins por manzana.
- Datos demo (teléfonos de admin, negocios) a reemplazar por reales antes del lanzamiento.
- **Fase 2 de caché (opcional, concepto del PDF)**: caché en el servidor (memoria o Redis) con
  TTL e invalidación en `backend/db/storage.js`. Solo si el profesor lo pide.

## Reglas de trabajo
- **No romper funcionalidad existente**: revisar antes de modificar; reutilizar la arquitectura
  actual (no crear sistemas paralelos, no cambiar tecnologías sin necesidad).
- Hacer `git pull` antes de empezar y **commit + push** al terminar cada cambio (deploy auto en Vercel).
- **Nunca** subir `.env` ni secretos (está en `.gitignore`).
- Secretos/entorno: ver `.env.example`. En local los datos son JSON en `backend/data/`.

## Convenciones de código
- Frontend sin build: HTML + JS vanilla, estilos con clases Tailwind. Sin `onclick` inline
  (bloqueado por CSP de Vercel); usar `addEventListener`.
- Respetar el estilo de commits existente: `tipo(ámbito): descripción` (p. ej. `fix(ui): ...`).
