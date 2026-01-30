import { readdir } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default async function loadEvents(client) {
    const eventsPath = join(__dirname, '../events');
    const eventFiles = await readdir(eventsPath).then(files => files.filter(file => file.endsWith('.js')));

    console.log(`Loading ${eventFiles.length} event files...`);

    for (const file of eventFiles) {
        const filePath = join(eventsPath, file);
        try {
            const { default: event } = await import(`file://${filePath}`);
            
            if (event.once) {
                client.once(event.name, (...args) => event.execute(...args, client));
                console.log(`Registered once event: ${event.name}`);
            } else {
                client.on(event.name, (...args) => event.execute(...args, client));
                console.log(`Registered on event: ${event.name}`);
            }
        } catch (error) {
            logger.error(`Error loading event ${file}:`, error);
        }
    }
    
    console.log(`Event loading completed. Registered events: ${client.eventNames().join(', ')}`);
}
