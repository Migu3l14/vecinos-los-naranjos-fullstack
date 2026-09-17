// Helper para subir imágenes con validación de tipo y tamaño.
// Se usa en la portada (registro de vitrina) y en el panel del vendedor.
import { API } from './api.js';

export const VALID_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

export function validateImageFile(file) {
  if (!file) return 'Selecciona una imagen.';
  if (!VALID_IMAGE_TYPES.includes(file.type)) return 'Formato no permitido. Usa JPG, PNG o WebP.';
  if (file.size > MAX_IMAGE_SIZE) return 'La imagen supera el tamaño máximo (5MB).';
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

// Conecta un <input type="file"> con su vista previa y un hidden que guarda la URL final.
// Convención de ids:
//   <input type="file" id="{baseId}">
//   <div id="{baseId}_preview" class="hidden"><img id="{baseId}_img"></div>
//   <input type="hidden" id="{baseId}_url">
//   <p id="{baseId}_err" class="hidden"></p>
// Retorna una función que devuelve la URL seleccionada (o '').
export function setupImageUpload(baseId) {
  const input = document.getElementById(baseId);
  if (!input || input.dataset.vupload === '1') return () => '';
  input.dataset.vupload = '1';

  const previewEl = document.getElementById(`${baseId}_preview`);
  const imgEl = document.getElementById(`${baseId}_img`);
  const urlInput = document.getElementById(`${baseId}_url`);
  const errorEl = document.getElementById(`${baseId}_err`);

  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const err = validateImageFile(file);
    if (err) {
      if (errorEl) { errorEl.textContent = err; errorEl.classList.remove('hidden'); }
      if (urlInput) urlInput.value = '';
      input.value = '';
      if (previewEl) previewEl.classList.add('hidden');
      return;
    }
    if (errorEl) errorEl.classList.add('hidden');
    if (previewEl) previewEl.classList.remove('hidden');
    if (imgEl) imgEl.src = URL.createObjectURL(file);

    const res = await uploadAndGetUrl(file);
    if (res.success && res.url) {
      if (urlInput) urlInput.value = res.url;
      if (imgEl) imgEl.src = res.url;
    } else {
      if (errorEl) { errorEl.textContent = res.message || 'No se pudo subir la imagen.'; errorEl.classList.remove('hidden'); }
      if (urlInput) urlInput.value = '';
      input.value = '';
      if (previewEl) previewEl.classList.add('hidden');
    }
  });

  return () => (urlInput ? urlInput.value : '');
}

// Limpia un upload ya cableado (para reiniciar formularios)
export function resetImageUpload(baseId) {
  const input = document.getElementById(baseId);
  const urlInput = document.getElementById(`${baseId}_url`);
  const previewEl = document.getElementById(`${baseId}_preview`);
  const errorEl = document.getElementById(`${baseId}_err`);
  if (input) input.value = '';
  if (urlInput) urlInput.value = '';
  if (previewEl) previewEl.classList.add('hidden');
  if (errorEl) errorEl.classList.add('hidden');
}