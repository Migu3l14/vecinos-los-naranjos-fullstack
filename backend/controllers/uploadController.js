import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { put } from '@vercel/blob';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IS_VERCEL = !!process.env.VERCEL;

// En Vercel el disco del proceso es efímero y solo /tmp es escribible.
const UPLOADS_DIR = process.env.UPLOADS_DIR
  || (IS_VERCEL ? path.join(os.tmpdir(), 'uploads') : path.join(__dirname, '../uploads'));

// Garantizar que la carpeta de uploads exista
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
// En Vercel el cuerpo de la petición tiene un límite duro; dejamos margen a 4MB.
const LIMIT = (IS_VERCEL ? 4 : 5) * 1024 * 1024;

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    let ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) ext = '.jpg';
    const name = `img-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: LIMIT, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error('Formato de imagen no permitido. Usa JPG, PNG o WebP.'));
  }
});

// Resuelve el archivo subido a una URL pública: en Vercel lo sube a Blob;
// en local devuelve la ruta estática servida en /uploads.
const toPublicUrl = async (file) => {
  if (IS_VERCEL) {
    const buffer = fs.readFileSync(file.path);
    const blob = await put(`uploads/${file.filename}`, buffer, {
      access: 'public',
      contentType: file.mimetype || 'application/octet-stream',
      addRandomSuffix: true
    });
    fs.unlinkSync(file.path);
    return blob.url;
  }
  return `/uploads/${file.filename}`;
};

const runMulter = (req, res, singleField) =>
  new Promise((resolve, reject) => {
    singleField(req, res, (err) => (err ? reject(err) : resolve(req.file)));
  });

// POST /api/uploads (público, rate-limited desde server.js)
// Campo multipart esperado: "image"
export const uploadImage = async (req, res) => {
  try {
    const file = await runMulter(req, res, upload.single('image'));
    if (!file) {
      return res.status(400).json({ success: false, message: 'No se recibió ninguna imagen.' });
    }
    const url = await toPublicUrl(file);
    res.status(201).json({
      success: true,
      message: 'Imagen subida correctamente.',
      data: { url }
    });
  } catch (err) {
    const message =
      err && err.code === 'LIMIT_FILE_SIZE'
        ? `La imagen supera el tamaño máximo permitido (${IS_VERCEL ? 4 : 5}MB).`
        : (err.message || 'Error al subir la imagen.');
    return res.status(400).json({ success: false, message });
  }
};

// ---------- Adjuntos de comunicados (imagen O PDF) ----------
const DOC_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const DOC_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];

const docStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    let ext = path.extname(file.originalname || '').toLowerCase();
    if (!DOC_EXT.includes(ext)) ext = '.jpg';
    const name = `doc-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, name);
  }
});

const uploadDoc = multer({
  storage: docStorage,
  limits: { fileSize: LIMIT, files: 1 },
  fileFilter: (req, file, cb) => {
    if (DOC_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error('Formato no permitido. Usa JPG, PNG, WebP o PDF.'));
  }
});

// POST /api/uploads/document (público, rate-limited desde server.js)
// Campo multipart esperado: "file"
export const uploadDocument = async (req, res) => {
  try {
    const file = await runMulter(req, res, uploadDoc.single('file'));
    if (!file) {
      return res.status(400).json({ success: false, message: 'No se recibió ningún adjunto.' });
    }
    const url = await toPublicUrl(file);
    const kind = path.extname(file.filename).toLowerCase() === '.pdf' ? 'pdf' : 'image';
    res.status(201).json({
      success: true,
      message: 'Adjunto subido correctamente.',
      data: { url, kind }
    });
  } catch (err) {
    const message =
      err && err.code === 'LIMIT_FILE_SIZE'
        ? `El adjunto supera el tamaño máximo permitido (${IS_VERCEL ? 4 : 5}MB).`
        : (err.message || 'Error al subir el adjunto.');
    return res.status(400).json({ success: false, message });
  }
};