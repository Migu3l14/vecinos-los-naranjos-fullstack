# Vitrina Digital Los Naranjos — Guía del Administrador

Plataforma de vitrinas digitales para los vecinos de **Los Naranjos** (6 manzanas).
Esta guía es para que el administrador vea **cómo se agregan y gestionan las cosas** en la plataforma.

---

## 1) Cómo entrar al panel de administración

1. Abre `http://localhost:4000` (o la URL pública donde esté montado) y entra a
   **`admin.html`** (botón "Administración" o directamente `tu-dominio/admin.html`).
2. En el login, escribe el **teléfono de administración** de la manzana y presiona
   "Enviar código".
3. Te llega un **código OTP de 4 dígitos** (en modo demo el código aparece en la
   consola del servidor, donde se imprime el `CÓDIGO DE VERIFICACIÓN`).
4. Ingresa el código y entras al panel.

### Teléfonos de administración demo (cambiar en `backend/data/adminUsers.json`)

| Manzana | Teléfono        | Login |
|---------|-----------------|-------|
| Mz 1    | 573001234501    | ✔     |
| Mz 2    | 573001234502    | ✔     |
| Mz 3    | 573001234503    | ✔     |
| Mz 4    | 573001234504    | ✔     |
| Mz 5    | 573001234505    | ✔     |
| Mz 6    | 573001234506    | ✔     |

> Cada administrador ve **solo su manzana** (no hay "admin global"). La manzana
> queda bloqueada en su cuenta y no puede publicar para otras manzanas.

---

## 2) Cómo agregar un **Comunicado Oficial**

1. En el panel entra a la pestaña **Comunicados** (es la quinta pestaña).
2. La manzana aparece **bloqueada** (es la tuya) y muestra cuántos residentes
   recibirían el mensaje en WhatsApp.
3. Llena **Título** (obligatorio) y **Mensaje**.
4. Opcional: adjunta una **imagen o un PDF** (hasta 5 MB). Se sube automáticamente.
5. Marca **"Enviar por WhatsApp a los residentes de esta manzana"** si quieres
   que además se retransmita el comunicado por WhatsApp.
6. Presiona **Publicar**.

El comunicado aparece de inmediato en la página principal, **solo** para los
usuarios que seleccionen esa manzana, con dos formatos:

- **Raíl de historias** estilo Instagram (arriba del directorio).
- **Tarjeta promocional** intercalada cada 4 vitrinas en el listado.

En el panel, cada comunicado tiene botones de **Ver**, **Eliminar** y
**Enviar por WhatsApp** (para re-transmitir uno ya publicado).

> Demo WhatsApp: si no hay llaves de Meta configuradas (ver sección 5), el envío
> se registra en la consola del servidor con `[BROADCAST]`.

---

## 3) Cómo se agregan las **Vitrinas** y sus **Productos**

- **El emprendedor** publica su vitrina desde la página principal
  (botón "Activa tu vitrina" o "Mi Vitrina") en 4 pasos: datos → productos →
  pago → activación.
- Cada vitrina puede tener **la cantidad de productos que quiera, sin límite**.
  El emprendedor los **agrega, edita y elimina** desde *Mi Vitrina → Productos*
  (nombre, descripción, foto, precio y disponibilidad).
- El administrador puede ver y eliminar vitrinas en la pestaña **Vitrinas**.

## 4) Cómo funcionan las **Valoraciones** (nuevo)

- Los **clientes** abren una vitrina, entran a **🌟 Valoraciones** → "Publicar
  valoración", eligen de **1 a 5 estrellas**, dejan comentario y envían.
- La **calificación promedio** y el **número de valoraciones** se ven **en la
  tarjeta de la vitrina** y dentro del perfil.
- Si el mismo cliente vuelve a valorar, **se actualiza su valoración** (no se duplica).
- Las últimas 5 valoraciones se muestran dentro de la vitrina.

## 5) Configuración importante (archivo `.env` en la raíz)

```
PORT=4000
JWT_SECRET=cambiar-en-produccion
APP_URL=http://localhost:4000
SUPPORT_WHATSAPP=573001234501            # número de Soporte (botón Contactar)
WHATSAPP_API_TOKEN=                      # llave de Meta Cloud API (broadcast real)
WHATSAPP_PHONE_NUMBER_ID=                # número de WhatsApp oficial de la administración
```

- `SUPPORT_WHATSAPP`: recibe los "Contactar" del modal de Soporte.
- `WHATSAPP_API_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`: si están vacíos, el envío
  de comunicados por WhatsApp solo sale en la consola (modo demo). Al configurarlos,
  el envío es real a los residentes registrados de la manzana.
- Modelo `.env.example` con todas las variables (incluidas las de Vercel/Upstash).

## 6) Cómo desplegar en Vercel (gratis, 24/7, sin tarjeta)

La app se despliega como **un servidor Express** (`api/index.js`) con datos en
**Upstash Redis** y archivos subidos en **Vercel Blob** (ambos con plan gratuito).

1. Crea la cuenta en https://vercel.com → **Login with GitHub** → connecta el repo.
2. En Upstash (https://console.upstash.com/redis) crea una base **gratuita** y copia
   `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`.
3. En Vercel → proyecto → **Settings → Environment Variables**:
   ```
   NODE_ENV=production
   JWT_SECRET=<genera uno aleatorio y largo>
   APP_URL=https://<tu-proyecto>.vercel.app
   UPSTASH_REDIS_REST_URL=...
   UPSTASH_REDIS_REST_TOKEN=...
   SUPPORT_WHATSAPP=573001234501
   WHATSAPP_API_TOKEN=          # opcional
   WHATSAPP_PHONE_NUMBER_ID=    # opcional
   ```
   (`BLOB_READ_WRITE_TOKEN` con la `vercel blob` la crea Vercel automáticamente.)
4. **Migra los datos actuales** una sola vez (desde tu PC, con las variables de
   Upstash en el entorno):
   ```bash
   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... node scripts/seed-upstash.mjs
   ```
   Esto **copia** `backend/data/*.json` a Redis; tus archivos locales no se tocan.
5. En Vercel haz **Deploy** (o cada push a `main` redeploya solo).
6. El **código OTP del admin** aparece en **Vercel → Logs** (Function Logs) y en la
   respuesta de la API (`data.code`), mientras no configures el envío por WhatsApp.

> Estándar de datos: con `UPSTASH_REDIS_REST_URL` activa la app usa Redis; sin esas
> variables usa tus archivos `backend/data/*.json` (modo local/dev). Nunca se borra nada.

## 7) Dónde está cada cosa en el servidor

- Datos: `backend/data/*.json` (`businesses.json`, `adminUsers.json`,
  `residents.json`, `towers.json`, `announcements.json`, ...)
- Teléfonos de administración: `backend/data/adminUsers.json`
- Número de soporte: `.env` → `SUPPORT_WHATSAPP`
- Comunicados: `backend/controllers/announcementController.js` y ruta
  `POST/GET/DELETE /api/announcements`, subida de archivo `POST /api/uploads/document`
- Valoraciones: `POST /api/businesses/:id/ratings`

## 8) Cómo arrancar la plataforma

```bash
npm start   # = bootstrap de datos + node backend/server.js
```

Se escucha en `http://localhost:4000`.

| Página      | URL                          |
|-------------|------------------------------|
| Cliente     | `http://localhost:4000`      |
| Panel Admin | `http://localhost:4000/admin.html` |
| Mi Vitrina  | `http://localhost:4000/mi-vitrina.html` |
| Recibo      | `http://localhost:4000/recibo.html` |

---

### Resumen de lo implementado

- ✅ Login de administración por **teléfono + OTP** (6 manzanas, sin correos)
- ✅ **Comunicados Oficiales por manzana** con raíl de historias + tarjetas + modal
- ✅ Envío de comunicados por **WhatsApp** por manzana (Meta Cloud + fallback demo)
- ✅ Subida de adjuntos **imagen o PDF** para comunicados
- ✅ **Productos ilimitados** por vitrina (agregar/editar/eliminar)
- ✅ **Valoraciones de clientes** con calificación visible en tarjetas y perfil
- ✅ Modal de **Soporte** con botón verde "Contactar" (WhatsApp directo)