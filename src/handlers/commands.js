import { readdir, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function getFiles(dir) {
  const dirents = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(dirents.map(async (dirent) => {
    const res = join(dir, dirent.name);
    return dirent.isDirectory() ? getFiles(res) : res;
  }));
  return files.flat();
}

export default async (client) => {
  try {
    const commandsPath = join(__dirname, '../commands');
    const commandFiles = (await getFiles(commandsPath))
      .filter(file => file.endsWith('.js') && !file.includes('_') && !file.includes('\\_') && !file.includes('/_'));
    
    let loadedCount = 0;

    for (const file of commandFiles) {
      try {
        const relativePath = file.replace(commandsPath, '').replace(/^[\\/]/, '').replace(/\\/g, '/');
        const commandModule = await import(`../commands/${relativePath}`);
        const command = commandModule.default;
        
        if (!command.data || !command.execute) {
          logger.warn(`Command at ${file} is missing required "data" or "execute" property.`);
          continue;
        }
        
        client.commands.set(command.data.name, command);
        loadedCount++;
        logger.debug(`Loaded command: ${command.data.name}`);
      } catch (error) {
        logger.error(`Error loading command ${file}:`, error);
      }
    }
    
    logger.info(`Successfully loaded ${loadedCount} commands`);
  } catch (error) {
    logger.error('Error loading commands:', error);
  }
};

