import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname } from 'path';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default async function loadEvents(client) {

  const eventsPath = join(__dirname, '../events');

  console.log('🔥 LOADER NUEVO FUNCIONANDO');

  async function load(dir) {

    console.log('📂 Leyendo carpeta:', dir);

    const files = await readdir(dir);

    for (const file of files) {

      const filePath = join(dir, file);
      const fileStat = await stat(filePath);

      // 🔥 SI ES CARPETA → ENTRA (IMPORTANTE PARA /logs)
      if (fileStat.isDirectory()) {
        await load(filePath);
        continue;
      }

      // 🔥 SOLO ARCHIVOS JS
      if (!file.endsWith('.js')) continue;

      try {

        // 🔥 IMPORT COMPATIBLE CON RAILWAY
        const fileUrl = pathToFileURL(filePath).href;

        const { default: event } = await import(fileUrl);

        if (!event?.name || typeof event.execute !== 'function') {
          logger.warn(`⚠️ Evento inválido: ${file}`);
          continue;
        }

        // 🔥 FIX IMPORTANTE (PASAR CLIENT)
        const safeExecute = async (...args) => {
          try {
            await event.execute(...args, client);
          } catch (error) {
            logger.error(`❌ Error en ${event.name}:`, error);
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

  await load(eventsPath);

}