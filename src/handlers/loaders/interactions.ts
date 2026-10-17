import { readdir } from 'fs/promises';
import { isLoadableModuleFile } from '../../utils/helpers.js';
import { join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname } from 'path';
import { logger } from '../../utils/logger.js';
import type { Collection } from 'discord.js';
import type { ButtonHandler, ModalHandler, NexoClient, SelectMenuHandler } from '../../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const interactionTypes = ['buttons', 'selectMenus', 'modals'] as const;

type InteractionHandler = ButtonHandler | SelectMenuHandler | ModalHandler;

function isInteractionHandler(value: unknown): value is InteractionHandler {
  return typeof value === 'object' && value !== null
    && 'name' in value && Boolean(value.name)
    && 'execute' in value && Boolean(value.execute);
}

async function getAllInteractionFiles(directory: string, fileList: string[] = []): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      await getAllInteractionFiles(entryPath, fileList);
    } else if (isLoadableModuleFile(entry.name)) {
      fileList.push(entryPath);
    }
  }

  return fileList;
}

export default async (client: NexoClient): Promise<void> => {
  try {
    const interactionsPath = join(__dirname, '../../interactions');

    for (const type of interactionTypes) {
      const typePath = join(interactionsPath, type);

      try {
        const interactionFiles = await getAllInteractionFiles(typePath);
        let loadedCount = 0;

        for (const filePath of interactionFiles) {
          const relativePath = filePath.slice(interactionsPath.length + 1).replace(/\\/g, '/');
          const fileName = relativePath.split('/').pop();

          try {
            const module: { default?: unknown } = await import(pathToFileURL(filePath).href);
            const moduleExport = module.default;
            const interactions: unknown[] = Array.isArray(moduleExport) ? moduleExport : [moduleExport];

            for (const interaction of interactions) {
              if (!isInteractionHandler(interaction)) {
                logger.warn(`Interaction ${relativePath} in ${type} is missing required properties.`);
                continue;
              }

              const registry: Collection<string, InteractionHandler> = client[type];
              registry.set(interaction.name, interaction);
              loadedCount += 1;
              logger.info(`Loaded ${type.slice(0, -1)}: ${interaction.name} (${fileName})`);
            }
          } catch (error) {
            logger.error(`Error loading interaction ${relativePath} in ${type}:`, error);
          }
        }

        logger.info(`Loaded ${loadedCount} ${type}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          logger.error(`Error loading ${type}:`, error);
        } else {
          logger.debug(`No ${type} directory found, skipping...`);
        }
      }
    }
  } catch (error) {
    logger.error('Error loading interactions:', error);
  }
};
