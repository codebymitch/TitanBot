import { readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname } from 'path';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default async function loadEvents(client) {

  const basePath = join(__dirname, '../events');

  console.log('🔥 LOADER NUEVO FUNCIONANDO');

  async function loadFiles(dir) {

    if (!existsSync(dir)) {
      console.log(`⚠️ Carpeta no existe: ${dir}`);
      return;
    }

    const files = await readdir(dir);

    for (const file of files) {

      if (!file.endsWith('.js')) continue;

      const filePath = join(dir, file);

      try {
        const fileUrl = pathToFileURL(filePath).href;
        const { default: event } = await import(fileUrl);

        if (!event?.name || typeof event.execute !== 'function') {
          logger.warn(`⚠️ Evento inválido: ${file}`);
          continue;
        }

        const safeExecute = async (...args) => {
          try {
            await event.execute(...args, client);
          } catch (err) {
            logger.error(`❌ Error en ${event.name}:`, err);
          }
        };

        if (event.once) {
          client.once(event.name, safeExecute);
        } else {
          client.on(event.name, safeExecute);
        }

        console.log(`✅ Loaded event: ${event.name} (${file})`);

      } catch (err) {
        logger.error(`❌ Error cargando ${file}:`, err);
      }
    }
  }

  // 🔥 eventos principales
  console.log('📂 Cargando eventos principales...');
  await loadFiles(basePath);

  // 🔥 logs
  const logsPath = join(basePath, 'logs');
  console.log('📂 Cargando eventos de logs...');
  await loadFiles(logsPath);
}