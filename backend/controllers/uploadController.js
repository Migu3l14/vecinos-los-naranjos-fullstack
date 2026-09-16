import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '../uploads');

// Garantizar que la carpeta de uploads exista
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

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
  limits: { fileSize: MAX_SIZE, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error('Formato de imagen no permitido. Usa JPG, PNG o WebP.'));
  }
});

// POST /api/uploads (público, rate-limited desde server.js)
// Campo multipart esperado: "image"
export const uploadImage = (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'La imagen supera el tamaño máximo permitido (5MB).'
          : (err.message || 'Error al subir la imagen.');
      return res.status(400).json({ success: false, message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No se recibió ninguna imagen.' });
    }
    res.status(201).json({
      success: true,
      message: 'Imagen subida correctamente.',
      data: { url: `/uploads/${req.file.filename}` }
    });
  });
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
  limits: { fileSize: MAX_SIZE, files: 1 },
  fileFilter: (req, file, cb) => {
    if (DOC_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error('Formato no permitido. Usa JPG, PNG, WebP o PDF.'));
  }
});

// POST /api/uploads/document (público, rate-limited desde server.js)
// Campo multipart esperado: "file"
export const uploadDocument = (req, res) => {
  uploadDoc.single('file')(req, res, (err) => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'El adjunto supera el tamaño máximo permitido (5MB).'
          : (err.message || 'Error al subir el adjunto.');
      return res.status(400).json({ success: false, message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No se recibió ningún adjunto.' });
    }
    const kind = path.extname(req.file.filename).toLowerCase() === '.pdf' ? 'pdf' : 'image';
    res.status(201).json({
      success: true,
      message: 'Adjunto subido correctamente.',
      data: { url: `/uploads/${req.file.filename}`, kind }
    });
  });
};