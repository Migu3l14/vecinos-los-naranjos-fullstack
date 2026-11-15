import { API } from './api.js';
import { openImageCropper } from './imageCropper.js';

export const VALID_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_SIZE = 4 * 1024 * 1024;
export const MAX_SOURCE_IMAGE_SIZE = 20 * 1024 * 1024;

const pendingUploads = new Map();

export function validateImageFile(file, options = {}) {
  if (!file) return 'Selecciona una imagen.';
  if (!VALID_IMAGE_TYPES.includes(file.type)) return 'Formato no permitido. Usa JPG, PNG o WebP.';
  const maxSize = options.source ? MAX_SOURCE_IMAGE_SIZE : MAX_IMAGE_SIZE;
  if (file.size > maxSize) {
    return options.source
      ? 'La imagen supera el tamaño máximo (20MB).'
      : 'La imagen supera el tamaño máximo (4MB).';
  }
  return null;
}

export async function uploadAndGetUrl(file) {
  const err = validateImageFile(file);
  if (err) return { success: false, message: err };
  const res = await API.uploadImage(file);
  if (res && res.success && res.data && res.data.url) {
    return { success: true, url: res.data.url };
  }
  return { success: false, message: (res && res.message) || 'Error al subir la imagen.' };
}

function hiddenInput(id, after) {
  let input = document.getElementById(id);
  if (!input) {
    input = document.createElement('input');
    input.type = 'hidden';
    input.id = id;
    if (after && after.parentNode) after.parentNode.insertBefore(input, after.nextSibling);
    else if (after) after.appendChild(input);
  }
  return input;
}

function parseCrop(value) {
  if (!value) return null;
  try {
    const crop = JSON.parse(value);
    return crop && typeof crop === 'object' ? crop : null;
  } catch {
    return null;
  }
}

function blobToFile(blob, prefix) {
  const type = blob.type || 'image/jpeg';
  const ext = type === 'image/png' ? 'png' : (type === 'image/webp' ? 'webp' : 'jpg');
  return new File([blob], `${prefix}-${Date.now()}.${ext}`, { type });
}

function setPreview(previewEl, imgEl, url) {
  if (!previewEl || !imgEl) return;
  if (url) {
    imgEl.src = url;
    previewEl.classList.remove('hidden');
  } else {
    imgEl.removeAttribute('src');
    previewEl.classList.add('hidden');
  }
}

function syncCropButton(baseId, hasImage) {
  document.querySelectorAll(`[data-crop-edit="${baseId}"]`).forEach((btn) => {
    btn.classList.toggle('hidden', !hasImage);
  });
}

export function setImageUploadValue(baseId, value = {}) {
  const urlInput = document.getElementById(`${baseId}_url`);
  const originalInput = hiddenInput(`${baseId}_original_url`, urlInput);
  const cropInput = hiddenInput(`${baseId}_crop`, originalInput);
  const previewEl = document.getElementById(`${baseId}_preview`);
  const imgEl = document.getElementById(`${baseId}_img`);
  const input = document.getElementById(baseId);

  if (urlInput) urlInput.value = value.url || '';
  if (originalInput) originalInput.value = value.originalUrl || '';
  if (cropInput) cropInput.value = value.crop ? JSON.stringify(value.crop) : '';
  if (input) input.value = '';
  setPreview(previewEl, imgEl, value.url || '');
  syncCropButton(baseId, Boolean(value.url));
}

export async function waitForImageUpload(baseId) {
  const pending = pendingUploads.get(baseId);
  if (!pending) return;
  try {
    await pending;
  } catch {
    // El error ya se muestra en el formulario.
  }
}

export async function waitForImageUploads(baseIds = []) {
  await Promise.all(baseIds.map((baseId) => waitForImageUpload(baseId)));
}

export function setupImageUpload(baseId) {
  const input = document.getElementById(baseId);
  if (!input || input.dataset.vupload === '1') return () => '';
  input.dataset.vupload = '1';

  const previewEl = document.getElementById(`${baseId}_preview`);
  const imgEl = document.getElementById(`${baseId}_img`);
  const urlInput = document.getElementById(`${baseId}_url`);
  const errorEl = document.getElementById(`${baseId}_err`);
  const originalInput = hiddenInput(`${baseId}_original_url`, urlInput);
  const cropInput = hiddenInput(`${baseId}_crop`, originalInput);
  const cropAspect = Number(input.dataset.cropAspect);
  const useCropper = Number.isFinite(cropAspect) && cropAspect > 0;

  const showError = (message) => {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  };

  const hideError = () => {
    if (errorEl) errorEl.classList.add('hidden');
  };

  const setValue = (value = {}) => {
    if (urlInput) urlInput.value = value.url || '';
    if (originalInput) originalInput.value = value.originalUrl || '';
    if (cropInput) cropInput.value = value.crop ? JSON.stringify(value.crop) : '';
    setPreview(previewEl, imgEl, value.url || '');
    syncCropButton(baseId, Boolean(value.url));
  };

  const uploadCropResult = async (result, uploadSource) => {
    const finalFile = blobToFile(result.finalBlob, 'recorte');
    const finalRes = await uploadAndGetUrl(finalFile);
    if (!finalRes.success) throw new Error(finalRes.message || 'No se pudo subir la imagen recortada.');

    let originalUrl = originalInput ? originalInput.value.trim() : '';
    if (uploadSource || !originalUrl) {
      const sourceFile = blobToFile(result.sourceBlob, 'original');
      const sourceRes = await uploadAndGetUrl(sourceFile);
      if (!sourceRes.success) throw new Error(sourceRes.message || 'No se pudo guardar la imagen original.');
      originalUrl = sourceRes.url;
    }

    setValue({ url: finalRes.url, originalUrl, crop: result.crop });
  };

  const openCropperFor = async (src, crop, uploadSource) => {
    const outputWidth = cropAspect > 1.2 ? 1600 : 1200;
    const result = await openImageCropper({
      src,
      aspect: cropAspect,
      crop,
      title: 'Ajustar imagen',
      outputWidth,
      outputHeight: Math.round(outputWidth / cropAspect),
      sourceMaxSize: 2000
    });
    if (!result) return false;

    const previous = {
      url: urlInput ? urlInput.value : '',
      originalUrl: originalInput ? originalInput.value : '',
      crop: cropInput ? cropInput.value : ''
    };
    if (result.previewUrl) setPreview(previewEl, imgEl, result.previewUrl);

    const task = (async () => {
      try {
        await uploadCropResult(result, uploadSource);
        hideError();
      } catch (error) {
        setValue({
          url: previous.url,
          originalUrl: previous.originalUrl,
          crop: parseCrop(previous.crop)
        });
        showError(error.message || 'No se pudo subir la imagen.');
      } finally {
        if (result.previewUrl) URL.revokeObjectURL(result.previewUrl);
        input.dataset.uploading = '';
      }
    })();

    pendingUploads.set(baseId, task);
    input.dataset.uploading = '1';
    await task;
    if (pendingUploads.get(baseId) === task) pendingUploads.delete(baseId);
    return true;
  };

  const openExisting = async () => {
    const crop = parseCrop(cropInput ? cropInput.value : '');
    const existingUrl = (originalInput && originalInput.value.trim()) || (urlInput && urlInput.value.trim());
    if (!existingUrl) {
      showError('Primero sube una imagen para ajustarla.');
      return;
    }
    await openCropperFor(existingUrl, crop, !originalInput || !originalInput.value.trim());
  };

  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const err = validateImageFile(file, { source: useCropper });
    if (err) {
      showError(err);
      if (urlInput) urlInput.value = '';
      input.value = '';
      setPreview(previewEl, imgEl, '');
      syncCropButton(baseId, false);
      return;
    }
    hideError();

    if (!useCropper) {
      setPreview(previewEl, imgEl, URL.createObjectURL(file));
      const res = await uploadAndGetUrl(file);
      if (res.success && res.url) {
        setValue({ url: res.url });
      } else {
        showError(res.message || 'No se pudo subir la imagen.');
        if (urlInput) urlInput.value = '';
        input.value = '';
        setPreview(previewEl, imgEl, '');
        syncCropButton(baseId, false);
      }
      return;
    }

    const localUrl = URL.createObjectURL(file);
    try {
      const applied = await openCropperFor(localUrl, null, true);
      if (!applied) {
        input.value = '';
      }
    } finally {
      URL.revokeObjectURL(localUrl);
      input.value = '';
    }
  });

  document.querySelectorAll(`[data-crop-edit="${baseId}"]`).forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      void openExisting();
    });
  });

  syncCropButton(baseId, Boolean(urlInput && urlInput.value));
  return () => (urlInput ? urlInput.value : '');
}

export function resetImageUpload(baseId) {
  const input = document.getElementById(baseId);
  const urlInput = document.getElementById(`${baseId}_url`);
  const originalInput = document.getElementById(`${baseId}_original_url`);
  const cropInput = document.getElementById(`${baseId}_crop`);
  const previewEl = document.getElementById(`${baseId}_preview`);
  const errorEl = document.getElementById(`${baseId}_err`);
  if (input) input.value = '';
  if (urlInput) urlInput.value = '';
  if (originalInput) originalInput.value = '';
  if (cropInput) cropInput.value = '';
  setPreview(previewEl, document.getElementById(`${baseId}_img`), '');
  if (previewEl) previewEl.classList.add('hidden');
  if (errorEl) errorEl.classList.add('hidden');
  syncCropButton(baseId, false);
}
