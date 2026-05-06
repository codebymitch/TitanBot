import { readdir } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default async function loadEvents(client) {

  const eventsPath = join(__dirname, '../events');

  // 🔥 FUNCIÓN RECURSIVA (CLAVE)
  async function load(dir) {

    const files = await readdir(dir);

    for (const file of files) {

      const filePath = join(dir, file);

      const stat = await import('fs/promises').then(fs => fs.stat(filePath));

      if (stat.isDirectory()) {

        // 🔥 entra en subcarpetas (logs)
        await load(filePath);

      } else if (file.endsWith('.js')) {

        try {

          const { default: event } = await import(`file://${filePath}`);

          if (!event?.name || typeof event.execute !== 'function') {
            logger.warn(`Event ${file} missing "name" or "execute".`);
            continue;
          }

          const safeExecute = async (...args) => {
            try {
              await event.execute(...args, client);
            } catch (error) {
              logger.error(`Error executing event ${event.name}:`, error);
            }
          };

          if (event.once) {
            client.once(event.name, safeExecute);
          } else {
            client.on(event.name, safeExecute);
          }

          console.log(`✅ Loaded event: ${event.name}`);

        } catch (error) {
          logger.error(`Error loading event ${file}:`, error);
        }

      }

    }

  }

  // 🚀 ejecutar loader
  await load(eventsPath);

}