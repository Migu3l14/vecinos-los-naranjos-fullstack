// Utilidades ligeras de validación/normalización de entrada (sin dependencias).
// Devuelven { message } en caso de error o null si el valor es válido.

export const validateFullName = (name) => {
  const value = String(name || '').trim();
  if (!value) return 'El nombre completo es obligatorio.';
  if (value.length < 3 || value.length > 80) return 'El nombre debe tener entre 3 y 80 caracteres.';
  return null;
};

export const validateEmail = (email) => {
  if (!email || !String(email).trim()) return null; // opcional
  const value = String(email).trim();
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (value.length > 120 || !re.test(value)) return 'Correo electrónico inválido.';
  return null;
};

export const validatePhone = (phone) => {
  const value = String(phone || '').replace(/\D/g, '');
  if (!value) return 'El teléfono es obligatorio.';
  if (value.length < 7 || value.length > 13) return 'El teléfono no es válido.';
  return null;
};

export const validatePassword = (password) => {
  const value = String(password || '');
  if (value.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'La contraseña debe incluir letras y números.';
  return null;
};

export const validateBirthDate = (birthDate) => {
  const value = String(birthDate || '').trim();
  if (!value) return 'La fecha de nacimiento es obligatoria.';
  const date = new Date(value);
  if (isNaN(date.getTime())) return 'La fecha de nacimiento no es válida.';
  const now = new Date();
  const age = now.getFullYear() - date.getFullYear();
  if (age < 12 || age > 120) return 'La fecha de nacimiento no corresponde a una edad válida (12–120 años).';
  return null;
};

// Longitud máxima genérica para campos de texto libre
export const enforceMaxLength = (value, max) => {
  const v = String(value || '');
  return v.length > max ? v.slice(0, max) : v;
};