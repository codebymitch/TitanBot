import { readdir } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname } from 'path';
import { logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const interactionTypes = ['buttons', 'selectMenus', 'modals'];

async function getAllInteractionFiles(directory, fileList = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await getAllInteractionFiles(entryPath, fileList);
    } else if (entry.name.endsWith('.js')) {
      fileList.push(entryPath);
    }
  }
  return fileList;
}

export default async (client) => {
  const interactionsPath = join(__dirname, '../../interactions');
  for (const type of interactionTypes) {
    try {
      const files = await getAllInteractionFiles(join(interactionsPath, type));
      let loadedCount = 0;
      for (const filePath of files) {
        const relativePath = filePath.slice(interactionsPath.length + 1).replace(/\\/g, '/');
        if (relativePath.startsWith('buttons/music/')) continue;
        try {
          const module = await import(pathToFileURL(filePath).href);
          const exports = Array.isArray(module.default) ? module.default : [module.default];
          for (const interaction of exports) {
            if (!interaction?.name || !interaction?.execute) {
              logger.warn(`Interaction ${relativePath} in ${type} is missing required properties.`);
              continue;
            }
            client[type].set(interaction.name, interaction);
            loadedCount += 1;
            logger.info(`Loaded ${type.slice(0, -1)}: ${interaction.name} (${relativePath.split('/').pop()})`);
          }
        } catch (error) {
          logger.error(`Error loading interaction ${relativePath} in ${type}:`, error);
        }
      }
      logger.info(`Loaded ${loadedCount} ${type}`);
    } catch (error) {
      if (error.code !== 'ENOENT') logger.error(`Error loading ${type}:`, error);
      else logger.debug(`No ${type} directory found, skipping...`);
    }
  }
};
