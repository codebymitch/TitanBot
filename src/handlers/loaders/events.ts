import { readdir } from 'fs/promises';
import { isLoadableModuleFile } from '../../utils/helpers.js';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from '../../utils/logger.js';
import type { BotEvent, NexoClient } from '../../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function isBotEvent(value: unknown): value is BotEvent {
    return typeof value === 'object' && value !== null
        && 'name' in value && Boolean(value.name)
        && 'execute' in value && typeof value.execute === 'function';
}

export default async function loadEvents(client: NexoClient): Promise<void> {
    const eventsPath = join(__dirname, '../../events');
    const eventFiles = await readdir(eventsPath).then(files => files.filter(isLoadableModuleFile));

    logger.info(`Found ${eventFiles.length} event files to load`);

    for (const file of eventFiles) {
        const filePath = join(eventsPath, file);
        try {
            const { default: event }: { default?: unknown } = await import(`file://${filePath}`);

            if (!isBotEvent(event)) {
                logger.warn(`Event ${file} is missing required "name" or "execute" properties.`);
                continue;
            }

            // Events are registered generically: discord.js passes the args of ClientEvents[event.name],
            // which is exactly what this event's execute expects, but TS cannot correlate the two here.
            const execute = event.execute as (...args: unknown[]) => unknown;
            const safeExecute = async (...args: unknown[]) => {
                try {
                    await execute(...args, client);
                } catch (error) {
                    logger.error(`Error executing event ${event.name}:`, error);
                }
            };

            if (event.once) {
                client.once(event.name, safeExecute);
                logger.info(`✅ Registered once event: ${event.name}`);
            } else {
                client.on(event.name, safeExecute);
                logger.info(`✅ Registered event: ${event.name}`);
            }
        } catch (error) {
            logger.error(`Error loading event ${file}:`, error);
        }
    }
}