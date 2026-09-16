import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.join(__dirname, '../data/categories.json');

export const getCategories = (req, res) => {
  try {
    const raw = fs.readFileSync(dataPath, 'utf-8');
    const categories = JSON.parse(raw);
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al leer categorías', error: error.message });
  }
};
