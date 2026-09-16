import fs from 'fs';
import path from 'path';
import { Redis } from '@upstash/redis';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Ruta local configurable (volúmenes en Railway / data local)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');

// En Vercel/cloud se usan las variables UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN.
// Sin ellas, la app cae al modo local con archivos JSON (backend/data/*.json).
const USE_REDIS = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
let redis = null;
let redisReady = false;
if (USE_REDIS) {
  try {
    redis = Redis.fromEnv();
    redisReady = true;
  } catch (err) {
    console.error('[STORAGE] No se pudo inicializar Upstash Redis, usando filesystem local.', err?.message);
    redis = null;
  }
}

const KEY_PREFIX = 'los-naranjos:';

/**
 * Capa de almacenamiento desacoplada (async).
 * - Cloud: Upstash Redis (una key por colección).
 * - Local/dev: archivos JSON en backend/data/*.json.
 *
 * Todos los consumidores usan `await storage.read('coleccion')`
 * y `await storage.write('coleccion', datos)`.
 */
export const Storage = {
  ensureDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    return DATA_DIR;
  },

  _key(collection) {
    const clean = String(collection).replace(/[^a-zA-Z0-9_-]/g, '');
    return KEY_PREFIX + clean;
  },

  _filePath(collection) {
    this.ensureDir();
    const clean = String(collection).replace(/[^a-zA-Z0-9_-]/g, '');
    return path.join(DATA_DIR, `${clean}.json`);
  },

  /**
   * Lee una colección completa. Si no existe, la inicializa en [].
   */
  async read(collection) {
    if (redisReady) {
      const raw = await redis.get(this._key(collection));
      if (raw == null) {
        await this.write(collection, []);
        return [];
      }
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        console.error(`[STORAGE] Error parseando ${collection} en Redis, devolviendo vacío.`, err.message);
        return [];
      }
    }
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
   */
  async write(collection, data) {
    if (redisReady) {
      await redis.set(this._key(collection), JSON.stringify(data));
      return;
    }
    const file = this._filePath(collection);
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  },

  /**
   * Busca un elemento por ID dentro de una colección.
   */
  async findById(collection, id) {
    const all = await this.read(collection);
    if (Array.isArray(all)) return all.find(item => item.id === id) || null;
    return null;
  },

  /**
   * Inserta un elemento al final de una colección (arreglos).
   */
  async insert(collection, item) {
    const all = await this.read(collection);
    if (Array.isArray(all)) {
      all.push(item);
      await this.write(collection, all);
      return item;
    }
    throw new Error(`[STORAGE] La colección ${collection} no es un arreglo, no se puede insertar.`);
  },

  /**
   * Actualiza un elemento por su id dentro de una colección.
   * @returns {Object|null} Elemento actualizado o null si no se encontró
   */
  async updateById(collection, id, patch) {
    const all = await this.read(collection);
    if (!Array.isArray(all)) return null;
    const index = all.findIndex(item => item.id === id);
    if (index === -1) return null;
    all[index] = { ...all[index], ...patch };
    await this.write(collection, all);
    return all[index];
  },

  redisAvailable() {
    return redisReady;
  }
};

export default Storage;