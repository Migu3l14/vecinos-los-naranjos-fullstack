import express from 'express';
import { uploadImage, uploadDocument } from '../controllers/uploadController.js';

const router = express.Router();

// POST /api/uploads — subir una imagen de portada/oferta/producto
router.post('/', uploadImage);

// POST /api/uploads/document — adjunto de comunicado (imagen o PDF)
router.post('/document', uploadDocument);

export default router;