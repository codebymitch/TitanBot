import { readdir } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default async (client) => {
  try {
    const eventsPath = join(__dirname, '../events');
    const eventFiles = (await readdir(eventsPath)).filter(file => file.endsWith('.js'));

    for (const file of eventFiles) {
      const event = (await import(`../events/${file}`)).default;
      
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
      } else {
        client.on(event.name, (...args) => event.execute(...args));
      }
      
      logger.debug(`Loaded event: ${event.name}`);
    }
    
    logger.info(`Loaded ${eventFiles.length} events`);
  } catch (error) {
    logger.error('Error loading events:', error);
  }
};
