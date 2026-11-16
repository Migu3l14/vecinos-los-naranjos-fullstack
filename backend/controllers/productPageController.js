import ENV from '../config/env.js';
import { findActiveProductById } from './businessController.js';

const escapeHtml = (value) => String(value == null ? '' : value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const compact = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();

const truncate = (value, max) => {
  const text = compact(value);
  return text.length > max ? `${text.slice(0, max - 3).trimEnd()}...` : text;
};

const firstHeaderValue = (value) => String(value || '').split(',')[0].trim();

// Origen absoluto de la petición. En Vercel llegan x-forwarded-proto/host;
// en local se usa el host normal y, como último recurso, APP_URL.
const getOrigin = (req) => {
  const proto = firstHeaderValue(req.headers['x-forwarded-proto']) || req.protocol || 'https';
  const host = firstHeaderValue(req.headers['x-forwarded-host']) || firstHeaderValue(req.headers.host);
  if (host) return `${proto}://${host}`.replace(/\/$/, '');
  return String(ENV.APP_URL || 'http://localhost:4000').replace(/\/$/, '');
};

const absoluteUrl = (value, origin) => {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  if (raw.startsWith('/')) return `${origin}${raw}`;
  return `${origin}/${raw.replace(/^\.?\//, '')}`;
};

const formatPrice = (value) => {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  if (/\$|cop/i.test(raw)) return raw;
  return /^\d/.test(raw) ? `$${raw}` : raw;
};

const priceNumber = (value) => {
  const digits = String(value == null ? '' : value).replace(/\D/g, '');
  const number = Number(digits);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const buildJsonLd = ({ product, business, image, shareUrl, price }) => {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: compact(product.name) || 'Producto',
    description: compact(product.description || business.shortDesc || ''),
    image: [image],
    url: shareUrl,
    brand: { '@type': 'Brand', name: compact(business.name) || 'Vitrina Digital Los Naranjos' }
  };
  const number = priceNumber(price);
  if (number) {
    data.offers = {
      '@type': 'Offer',
      priceCurrency: 'COP',
      price: String(number),
      availability: product.availability === 'agotado'
        ? 'https://schema.org/OutOfStock'
        : 'https://schema.org/InStock',
      url: shareUrl
    };
  }
  return JSON.stringify(data).replace(/</g, '\\u003c');
};

const STYLES = `
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    background:#f1f5f9;color:#0f172a}
  .card{width:100%;max-width:420px;background:#fff;border-radius:24px;overflow:hidden;
    box-shadow:0 18px 50px rgba(15,23,42,.16);padding:18px}
  .brand{margin:0 0 14px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#f97316}
  .media{width:100%;aspect-ratio:1/1;background:#e2e8f0;border-radius:16px;overflow:hidden;position:relative}
  .media img{width:100%;height:100%;object-fit:cover;object-position:center;display:block}
  .ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-weight:700}
  .badge{display:inline-block;margin-top:12px;padding:4px 10px;border-radius:999px;
    font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#fff;background:#10b981}
  .badge.off{background:#ef4444}
  .cat{margin:10px 0 0;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#ea580c}
  h1{margin:4px 0 0;font-size:23px;line-height:1.2;color:#0f172a}
  .price{margin:6px 0 0;font-size:19px;font-weight:800;color:#059669}
  .biz{margin:4px 0 0;font-size:12px;font-weight:700;color:#94a3b8}
  .desc{margin:12px 0 0;font-size:14px;line-height:1.55;color:#475569;white-space:pre-line}
  .btn{display:block;margin-top:16px;padding:14px 16px;border-radius:14px;background:#f97316;color:#fff;
    text-align:center;text-decoration:none;font-size:14px;font-weight:800;box-shadow:0 10px 20px rgba(249,115,22,.28)}
  .btn:active{background:#ea580c}
  .hint{margin:10px 0 0;text-align:center;font-size:11px;color:#94a3b8}
  .error-title{margin:6px 0 0;font-size:22px;line-height:1.25}
`;

const pageShell = ({ title, description, shareUrl, image, body, extraHead = '' }) => `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${escapeHtml(shareUrl)}" />
<meta property="og:site_name" content="Vitrina Digital Los Naranjos" />
<meta property="og:type" content="product" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${escapeHtml(shareUrl)}" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:image:alt" content="${escapeHtml(title)}" />
<meta property="og:locale" content="es_CO" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
<meta name="theme-color" content="#f97316" />
${extraHead}
<style>${STYLES}</style>
</head>
<body>${body}</body>
</html>`;

const productHtml = ({ product, business, image, shareUrl, target, title, description }) => {
  const name = compact(product.name) || 'Producto';
  const agotado = product.availability === 'agotado';
  const price = formatPrice(product.price);
  const media = image
    ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(name)}" />`
    : '<div class="ph">Sin foto</div>';
  const jsonLd = buildJsonLd({ product, business, image, shareUrl, price });

  return pageShell({
    title,
    description,
    shareUrl,
    image,
    extraHead: `<script type="application/ld+json">${jsonLd}</script>`,
    body: `
<main class="card">
  <p class="brand">Vitrina Digital Los Naranjos</p>
  <div class="media">${media}</div>
  <span class="badge${agotado ? ' off' : ''}">${agotado ? 'Agotado' : 'Disponible'}</span>
  <p class="cat">${escapeHtml(product.category || 'General')}</p>
  <h1>${escapeHtml(name)}</h1>
  ${price ? `<p class="price">${escapeHtml(price)}</p>` : ''}
  <p class="biz">Manzana ${escapeHtml(business.manzana || '')} - ${escapeHtml(compact(business.name))}</p>
  ${product.description ? `<p class="desc">${escapeHtml(product.description)}</p>` : ''}
  <a class="btn" href="${escapeHtml(target)}">Abrir en la app</a>
  <p class="hint">Te estamos llevando a la vitrina...</p>
</main>
<script>window.location.replace(${JSON.stringify(target)});</script>`
  });
};

const notFoundHtml = ({ origin }) => pageShell({
  title: 'Producto no disponible | Vitrina Digital Los Naranjos',
  description: 'Este producto ya no está disponible en la Vitrina Digital Los Naranjos.',
  shareUrl: `${origin}/`,
  image: `${origin}/images/arbol-naranjos.png`,
  body: `
<main class="card">
  <p class="brand">Vitrina Digital Los Naranjos</p>
  <h1 class="error-title">Este producto ya no está disponible</h1>
  <p class="desc">Puede que la vitrina esté pausada o que el enlace haya cambiado. Explora las demás vitrinas de la comunidad.</p>
  <a class="btn" href="/">Ir a la vitrina</a>
</main>`
});

const errorHtml = ({ origin }) => pageShell({
  title: 'No pudimos abrir este producto | Vitrina Digital Los Naranjos',
  description: 'Ocurrió un error al cargar el producto. Intenta de nuevo.',
  shareUrl: `${origin}/`,
  image: `${origin}/images/arbol-naranjos.png`,
  body: `
<main class="card">
  <p class="brand">Vitrina Digital Los Naranjos</p>
  <h1 class="error-title">No pudimos abrir este producto</h1>
  <p class="desc">Intenta de nuevo en unos segundos o vuelve a la vitrina principal.</p>
  <a class="btn" href="/">Ir a la vitrina</a>
</main>`
});

// GET /p/:id - Página pública del producto con metadatos Open Graph.
// WhatsApp lee las etiquetas del HTML inicial; las personas son redirigidas
// a la app con el producto abierto.
export const renderProductPage = async (req, res) => {
  const origin = getOrigin(req);
  try {
    const found = await findActiveProductById(req.params.id);
    if (!found) {
      res.status(404).set('Cache-Control', 'no-store');
      res.type('html').send(notFoundHtml({ origin }));
      return;
    }

    const { business, product } = found;
    const productId = encodeURIComponent(String(product.id));
    const businessId = encodeURIComponent(String(business.id));
    const shareUrl = `${origin}/p/${productId}`;
    const target = `/?producto=${productId}&vitrina=${businessId}`;
    const image = absoluteUrl(product.photo || product.image || business.coverImage, origin)
      || `${origin}/images/arbol-naranjos.png`;
    const price = formatPrice(product.price);
    const title = price ? `${compact(product.name)} | ${price}` : compact(product.name) || 'Producto';
    const description = truncate(
      `${compact(business.name)} - Manzana ${business.manzana}. ${product.description || business.shortDesc || 'Producto disponible en Los Naranjos.'}`,
      160
    );

    res.set('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    res.type('html').send(productHtml({
      product,
      business,
      image,
      shareUrl,
      target,
      title,
      description
    }));
  } catch (error) {
    console.error('[PRODUCT PAGE]', error && error.message);
    res.status(500).set('Cache-Control', 'no-store');
    res.type('html').send(errorHtml({ origin }));
  }
};

export default { renderProductPage };
