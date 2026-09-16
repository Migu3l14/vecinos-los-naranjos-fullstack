// bootstrap-data.mjs
// Al primer arranque en un volumen vacío (Railway / producción), copia los datos
// semilla commiteados en backend/data hacia el directorio persistente (DATA_DIR).
// En desarrollo (DATA_DIR sin definir) no hace nada porque el destino es el mismo.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = path.resolve(__dirname, '../backend/data');
const DEST_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : SRC_DIR;

if (path.resolve(SRC_DIR) === path.resolve(DEST_DIR)) {
  console.log('[BOOTSTRAP] DATA_DIR no configurado, usando backend/data local (dev).');
} else {
  fs.mkdirSync(DEST_DIR, { recursive: true });
  const seeds = fs.existsSync(SRC_DIR) ? fs.readdirSync(SRC_DIR).filter(f => f.endsWith('.json')) : [];
  let copied = 0;
  for (const file of seeds) {
    const dest = path.join(DEST_DIR, file);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(path.join(SRC_DIR, file), dest);
      copied += 1;
    }
  }
  console.log(`[BOOTSTRAP] Volumen ${DEST_DIR}: ${copied} archivo(s) sembrado(s) desde backend/data.`);
}