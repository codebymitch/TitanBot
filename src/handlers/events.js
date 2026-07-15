import { join } from 'path';
import { pathToFileURL } from 'url';
import { logger } from '../utils/logger.js';

const eventNames = ['ready.js', 'interactionCreate.js', 'guildMemberAdd.js', 'guildMemberRemove.js', 'messageCreate.js'];
export default async function loadEvents(client) {
  const root = new URL('../events/', import.meta.url);
  for (const filename of eventNames) {
    const event = (await import(new URL(filename, root).href)).default;
    const safeExecute = (...args) => event.execute(...args, client).catch(error => logger.error(`Event ${event.name} failed`, error));
    client[event.once ? 'once' : 'on'](event.name, safeExecute);
  }
}
