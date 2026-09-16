import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Ruta configurable: en Railway se monta un volumen y se apunta con DATA_DIR
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');

/**
 * Capa de almacenamiento desacoplada.
 * Hoy usa archivos JSON en backend/data/*.json.
 *
 * Para migrar a MySQL de GoDaddy, solo se debe reemplazar la implementación
 * interna de read()/write() manteniendo la misma firma. Ningún controller
 * necesita cambiar: todos interactúan con `storage.read('coleccion')`
 * y `storage.write('coleccion', datos)`.
 */
export const Storage = {
  /**
   * Garantiza que el directorio de datos exista.
   */
  ensureDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    return DATA_DIR;
  },

  _filePath(collection) {
    this.ensureDir();
    const clean = String(collection).replace(/[^a-zA-Z0-9_-]/g, '');
    return path.join(DATA_DIR, `${clean}.json`);
  },

  /**
   * Lee una colección completa. Si la colección no existe, la inicializa en [].
   * @param {string} collection - Nombre de la colección (archivo sin .json)
   * @returns {Array|Object} Datos almacenados
   */
  read(collection) {
    const file = this._filePath(collection);
    if (!fs.existsSync(file)) {
      this.write(collection, []);
      return [];
    }
    const raw = fs.readFileSync(file, 'utf-8');
    try {
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.error(`[STORAGE] Error parseando ${collection}.json, devolviendo vacío.`, err.message);
      return [];
    }
  },

  /**
   * Escribe una colección completa.
   * @param {string} collection - Nombre de la colección
   * @param {Array|Object} data - Datos a guardar
   */
  write(collection, data) {
    this.ensureDir();
    const file = this._filePath(collection);
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  },

  /**
   * Busca un elemento por ID dentro de una colección.
   */
  findById(collection, id) {
    const all = this.read(collection);
    if (Array.isArray(all)) return all.find(item => item.id === id) || null;
    return null;
  },

  /**
   * Inserta un elemento al final de una colección (arreglos).
   */
  insert(collection, item) {
    const all = this.read(collection);
    if (Array.isArray(all)) {
      all.push(item);
      this.write(collection, all);
      return item;
    }
    throw new Error(`[STORAGE] La colección ${collection} no es un arreglo, no se puede insertar.`);
  },

  /**
   * Actualiza un elemento por su id dentro de una colección.
   * @returns {Object|null} Elemento actualizado o null si no se encontró
   */
  updateById(collection, id, patch) {
    const all = this.read(collection);
    if (!Array.isArray(all)) return null;
    const index = all.findIndex(item => item.id === id);
    if (index === -1) return null;
    all[index] = { ...all[index], ...patch };
    this.write(collection, all);
    return all[index];
  }
};

export default Storage;
