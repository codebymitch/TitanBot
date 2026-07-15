import { readdir } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { logger } from '../utils/logger.js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '../modules/interactions');
export default async function loadInteractions(client) {
  for (const type of ['buttons', 'selectMenus', 'modals']) {
    const directory = join(root, type);
    let files = [];
    try { files = (await readdir(directory)).filter(file => file.endsWith('.js')); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    for (const file of files) {
      const mod = (await import(pathToFileURL(join(directory, file)).href)).default;
      for (const handler of (Array.isArray(mod) ? mod : [mod])) {
        if (!handler?.name || typeof handler.execute !== 'function') throw new Error(`Invalid ${type} handler: ${file}`);
        client[type].set(handler.name, handler);
      }
    }
    logger.info(`Loaded ${client[type].size} ${type}`);
  }
}
