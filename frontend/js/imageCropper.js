const MAX_OUTPUT_BYTES = 3.7 * 1024 * 1024;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

let activeSession = null;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function ensureModal() {
  let modal = document.getElementById('imageCropperModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'imageCropperModal';
    modal.className = 'hidden';
    document.body.appendChild(modal);
  }
  return modal;
}

function loadImage(url, useCors = true) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (useCors) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
    img.src = url;
  });
}

async function prepareSource(src) {
  if (!src) throw new Error('No hay imagen para ajustar.');
  if (/^(blob:|data:)/i.test(src)) return { url: src, revokeUrl: '' };

  try {
    const res = await fetch(src, { mode: 'cors' });
    if (!res.ok) throw new Error('fetch');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    return { url, revokeUrl: url };
  } catch {
    return { url: src, revokeUrl: '' };
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function encodeCanvas(canvas) {
  const qualities = [0.9, 0.82, 0.72, 0.62];
  let last = null;
  for (const type of ['image/webp', 'image/jpeg']) {
    for (const quality of qualities) {
      const blob = await canvasToBlob(canvas, type, quality);
      if (!blob) continue;
      last = blob;
      if (blob.size <= MAX_OUTPUT_BYTES) return blob;
    }
  }
  return last;
}

function cropCss(aspect) {
  return `aspect-ratio:${Number(aspect).toFixed(6)};`;
}

export function openImageCropper(options = {}) {
  if (activeSession) return Promise.resolve(null);

  const modal = ensureModal();
  const aspect = clamp(Number(options.aspect) || 1, 0.25, 4);
  const title = options.title || 'Ajustar imagen';

  return new Promise((resolve) => {
    let source = null;
    let image = null;
    let stage = null;
    let canvas = null;
    let ctx = null;
    let resizeObserver = null;
    let renderQueued = false;
    let closed = false;

    const cropState = {
      zoom: clamp(Number(options.crop && options.crop.zoom) || 1, MIN_ZOOM, MAX_ZOOM),
      cx: clamp(Number(options.crop && options.crop.cx) || 0.5, 0, 1),
      cy: clamp(Number(options.crop && options.crop.cy) || 0.5, 0, 1)
    };

    modal.className = 'fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]" role="dialog" aria-modal="true" aria-label="Ajustar imagen">
        <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
          <div class="min-w-0">
            <h3 class="text-sm font-extrabold text-slate-900 truncate">${title}</h3>
            <p class="text-[10px] text-slate-400 mt-0.5">Arrastra para mover. Usa la rueda, la pinza o el control de zoom.</p>
          </div>
          <button type="button" data-crop-cancel class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center flex-shrink-0" aria-label="Cerrar">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="p-4 overflow-y-auto">
          <div id="vnCropStage" class="vn-crop-stage" style="${cropCss(aspect)}">
            <canvas id="vnCropCanvas"></canvas>
            <div id="vnCropLoader" class="absolute inset-0 flex items-center justify-center bg-slate-900 text-slate-200 text-xs font-bold">
              <i class="fa-solid fa-spinner fa-spin mr-2"></i> Cargando imagen...
            </div>
            <div id="vnCropError" class="hidden absolute inset-0 flex items-center justify-center bg-slate-900 text-red-200 text-xs font-bold p-4 text-center"></div>
          </div>
          <div class="mt-4">
            <div class="flex items-center justify-between text-[11px] font-bold text-slate-500">
              <span>Zoom</span>
              <span id="vnCropZoomLabel">${cropState.zoom.toFixed(2)}x</span>
            </div>
            <input id="vnCropZoom" type="range" min="${MIN_ZOOM}" max="${MAX_ZOOM}" step="0.01" value="${cropState.zoom}" class="w-full mt-1 accent-orange-500" />
            <p class="text-[10px] text-slate-400 mt-2">La imagen publicada usará exactamente este encuadre.</p>
          </div>
        </div>
        <div class="p-4 border-t border-slate-100 flex items-center gap-2">
          <button type="button" data-crop-reset class="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl">Restablecer</button>
          <button type="button" data-crop-cancel class="flex-1 py-2.5 border border-slate-300 text-slate-600 text-xs font-bold rounded-xl">Cancelar</button>
          <button type="button" data-crop-apply class="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-extrabold rounded-xl shadow disabled:opacity-50" disabled>Aplicar</button>
        </div>
      </div>`;

    const close = (result) => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKeyDown);
      if (resizeObserver) resizeObserver.disconnect();
      if (source && source.revokeUrl) URL.revokeObjectURL(source.revokeUrl);
      modal.className = 'hidden';
      modal.innerHTML = '';
      activeSession = null;
      resolve(result);
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') close(null);
    };

    document.addEventListener('keydown', onKeyDown);
    modal.querySelectorAll('[data-crop-cancel]').forEach((btn) => btn.addEventListener('click', () => close(null)));
    modal.addEventListener('click', (event) => {
      if (event.target === modal) close(null);
    });

    const metrics = () => {
      const stageW = stage ? stage.clientWidth : 0;
      const stageH = stage ? stage.clientHeight : 0;
      const base = Math.max(stageW / image.naturalWidth, stageH / image.naturalHeight);
      const scale = base * cropState.zoom;
      const dw = image.naturalWidth * scale;
      const dh = image.naturalHeight * scale;
      const halfW = (stageW / 2) / dw;
      const halfH = (stageH / 2) / dh;
      return { stageW, stageH, base, scale, dw, dh, halfW, halfH };
    };

    const clampCrop = () => {
      if (!image || !stage) return;
      const { halfW, halfH } = metrics();
      cropState.cx = halfW >= 0.5 ? 0.5 : clamp(cropState.cx, halfW, 1 - halfW);
      cropState.cy = halfH >= 0.5 ? 0.5 : clamp(cropState.cy, halfH, 1 - halfH);
    };

    const draw = () => {
      if (!image || !canvas || !ctx || !stage) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, stage.clientWidth);
      const height = Math.max(1, stage.clientHeight);
      const bufferWidth = Math.round(width * dpr);
      const bufferHeight = Math.round(height * dpr);
      if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
        canvas.width = bufferWidth;
        canvas.height = bufferHeight;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);
      const { scale, dw, dh } = metrics();
      const x = width / 2 - cropState.cx * dw;
      const y = height / 2 - cropState.cy * dh;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, x, y, dw, dh);
      const zoomLabel = document.getElementById('vnCropZoomLabel');
      const zoomInput = document.getElementById('vnCropZoom');
      if (zoomLabel) zoomLabel.textContent = `${cropState.zoom.toFixed(2)}x`;
      if (zoomInput && zoomInput.value !== String(cropState.zoom)) zoomInput.value = String(cropState.zoom);
      void scale;
    };

    const requestDraw = () => {
      if (renderQueued) return;
      renderQueued = true;
      requestAnimationFrame(() => {
        renderQueued = false;
        clampCrop();
        draw();
      });
    };

    const setupCanvas = () => {
      stage = document.getElementById('vnCropStage');
      canvas = document.getElementById('vnCropCanvas');
      if (!stage || !canvas) return;
      ctx = canvas.getContext('2d');
      resizeObserver = new ResizeObserver(requestDraw);
      resizeObserver.observe(stage);
      draw();
    };

    const setupPointerControls = () => {
      const pointers = new Map();
      let lastDistance = 0;

      const distance = () => {
        const pts = Array.from(pointers.values());
        if (pts.length < 2) return 0;
        return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      };

      stage.addEventListener('pointerdown', (event) => {
        if (!image || event.button > 0) return;
        stage.setPointerCapture(event.pointerId);
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        lastDistance = pointers.size >= 2 ? distance() : 0;
        canvas.classList.add('is-dragging');
      });

      stage.addEventListener('pointermove', (event) => {
        if (!image || !pointers.has(event.pointerId)) return;
        const prev = pointers.get(event.pointerId);
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (pointers.size >= 2) {
          const nextDistance = distance();
          if (lastDistance > 0 && nextDistance > 0) {
            cropState.zoom = clamp(cropState.zoom * (nextDistance / lastDistance), MIN_ZOOM, MAX_ZOOM);
          }
          lastDistance = nextDistance;
          requestDraw();
          return;
        }

        const { dw, dh } = metrics();
        const dx = event.clientX - prev.x;
        const dy = event.clientY - prev.y;
        cropState.cx -= dx / dw;
        cropState.cy -= dy / dh;
        requestDraw();
      });

      const endPointer = (event) => {
        pointers.delete(event.pointerId);
        if (pointers.size < 2) lastDistance = 0;
        if (pointers.size === 0) canvas.classList.remove('is-dragging');
      };
      stage.addEventListener('pointerup', endPointer);
      stage.addEventListener('pointercancel', endPointer);
      stage.addEventListener('pointerleave', (event) => {
        if (event.buttons === 0) endPointer(event);
      });

      stage.addEventListener('wheel', (event) => {
        if (!image) return;
        event.preventDefault();
        const factor = Math.exp(-event.deltaY * 0.0015);
        cropState.zoom = clamp(cropState.zoom * factor, MIN_ZOOM, MAX_ZOOM);
        requestDraw();
      }, { passive: false });

      stage.addEventListener('dblclick', () => {
        cropState.zoom = 1;
        cropState.cx = 0.5;
        cropState.cy = 0.5;
        requestDraw();
      });
    };

    const exportResult = async () => {
      if (!image || !stage) return;
      const applyBtn = modal.querySelector('[data-crop-apply]');
      applyBtn.disabled = true;
      applyBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Generando...';

      try {
        clampCrop();
        const { stageW, stageH, scale } = metrics();
        const cropW = stageW / scale;
        const cropH = stageH / scale;
        const sx = clamp(cropState.cx * image.naturalWidth - cropW / 2, 0, Math.max(0, image.naturalWidth - cropW));
        const sy = clamp(cropState.cy * image.naturalHeight - cropH / 2, 0, Math.max(0, image.naturalHeight - cropH));

        const outputWidth = Math.round(options.outputWidth || (aspect >= 1 ? 1600 : 1200));
        const outputHeight = Math.round(options.outputHeight || (outputWidth / aspect));
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = outputWidth;
        finalCanvas.height = outputHeight;
        const finalCtx = finalCanvas.getContext('2d');
        finalCtx.fillStyle = '#ffffff';
        finalCtx.fillRect(0, 0, outputWidth, outputHeight);
        finalCtx.imageSmoothingEnabled = true;
        finalCtx.imageSmoothingQuality = 'high';
        finalCtx.drawImage(image, sx, sy, cropW, cropH, 0, 0, outputWidth, outputHeight);
        const finalBlob = await encodeCanvas(finalCanvas);
        if (!finalBlob) throw new Error('No se pudo generar la imagen recortada.');

        const maxSource = Math.max(600, Number(options.sourceMaxSize) || 2000);
        const sourceScale = Math.min(1, maxSource / Math.max(image.naturalWidth, image.naturalHeight));
        const sourceWidth = Math.max(1, Math.round(image.naturalWidth * sourceScale));
        const sourceHeight = Math.max(1, Math.round(image.naturalHeight * sourceScale));
        const sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = sourceWidth;
        sourceCanvas.height = sourceHeight;
        const sourceCtx = sourceCanvas.getContext('2d');
        sourceCtx.fillStyle = '#ffffff';
        sourceCtx.fillRect(0, 0, sourceWidth, sourceHeight);
        sourceCtx.imageSmoothingEnabled = true;
        sourceCtx.imageSmoothingQuality = 'high';
        sourceCtx.drawImage(image, 0, 0, sourceWidth, sourceHeight);
        const sourceBlob = await encodeCanvas(sourceCanvas);
        if (!sourceBlob) throw new Error('No se pudo preparar la imagen original.');

        const crop = {
          aspect: Number(aspect.toFixed(4)),
          zoom: Number(cropState.zoom.toFixed(4)),
          cx: Number(cropState.cx.toFixed(4)),
          cy: Number(cropState.cy.toFixed(4)),
          sourceWidth: image.naturalWidth,
          sourceHeight: image.naturalHeight,
          outputWidth,
          outputHeight
        };

        close({
          finalBlob,
          sourceBlob,
          crop,
          previewUrl: URL.createObjectURL(finalBlob)
        });
      } catch (error) {
        console.error('[CROP] Error generando imagen:', error);
        applyBtn.disabled = false;
        applyBtn.textContent = 'Aplicar';
        const errorEl = document.getElementById('vnCropError');
        if (errorEl) {
          errorEl.textContent = 'No se pudo generar el recorte. Prueba con otra imagen.';
          errorEl.classList.remove('hidden');
        }
      }
    };

    const initialize = async () => {
      try {
        source = await prepareSource(options.src);
        try {
          image = await loadImage(source.url, true);
        } catch {
          image = await loadImage(source.url, false);
        }
        setupCanvas();
        setupPointerControls();
        const loader = document.getElementById('vnCropLoader');
        if (loader) loader.classList.add('hidden');
        const applyBtn = modal.querySelector('[data-crop-apply]');
        if (applyBtn) applyBtn.disabled = false;
        const resetBtn = modal.querySelector('[data-crop-reset]');
        if (resetBtn) {
          resetBtn.addEventListener('click', () => {
            cropState.zoom = 1;
            cropState.cx = 0.5;
            cropState.cy = 0.5;
            requestDraw();
          });
        }
        const zoomInput = document.getElementById('vnCropZoom');
        if (zoomInput) {
          zoomInput.addEventListener('input', () => {
            cropState.zoom = clamp(Number(zoomInput.value) || 1, MIN_ZOOM, MAX_ZOOM);
            requestDraw();
          });
        }
        if (applyBtn) applyBtn.addEventListener('click', exportResult);
        requestDraw();
      } catch (error) {
        console.error('[CROP] Error cargando imagen:', error);
        const loader = document.getElementById('vnCropLoader');
        if (loader) loader.classList.add('hidden');
        const errorEl = document.getElementById('vnCropError');
        if (errorEl) {
          errorEl.textContent = 'No se pudo cargar la imagen. Si ya estaba guardada, intenta de nuevo o sube una nueva.';
          errorEl.classList.remove('hidden');
        }
      }
    };

    activeSession = { close };
    void initialize();
  });
}
