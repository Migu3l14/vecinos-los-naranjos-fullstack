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
  `admin.html`, `mi-vitrina.html`, `recibo.html`; lógica en `frontend/js/`.
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

## Estado actual (dónde quedamos)
- **HEAD / GitHub `main`: `d227a44`** — "fix(security): 5 vulnerabilidades en las APIs REST
  (incluye webhook de Wompi sin firma) (#1)" (4 oct 2026).
- Copia local **sincronizada** con GitHub (fast-forward `b302769..d227a44`).
- Último trabajo funcional (22 sep): **QR para compartir por WhatsApp** (modal con QR, envío
  como imagen; se quitó el botón "Descargar QR").
- Trabajo del 20 sep ya incluido: flujo QR con rol comprador/vendedor, 10 torres por manzana,
  reconocimiento por celular (sesión persistente ~1 año), header/branding/banner, sección
  **Mi Manzana** en acordeón, tab Residentes en admin, y los arreglos de seguridad.

## Pendientes / próximos pasos (confirmar con el usuario)
- Verificar que los **iconos de redes sociales (Instagram/Facebook) se vean en móvil** al abrir una vitrina.
- Configurar envío **real** de WhatsApp (llenar `WHATSAPP_API_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`).
- **Migración final a GoDaddy** (hosting + base de datos real con negocios reales). Pospuesto.
- Posible **ADMINISTRADOR_GENERAL** (superusuario) que gestione todas las manzanas; hoy solo
  existen admins por manzana.
- Datos demo (teléfonos de admin, negocios) a reemplazar por reales antes del lanzamiento.

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
