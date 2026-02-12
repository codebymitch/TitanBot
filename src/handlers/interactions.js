import { readdir } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const interactionTypes = ['buttons', 'selectMenus', 'modals'];

export default async (client) => {
  try {
    const interactionsPath = join(__dirname, '../interactions');
    
    for (const type of interactionTypes) {
      const typePath = join(interactionsPath, type);
      
      try {
        const interactionFiles = (await readdir(typePath)).filter(file => file.endsWith('.js'));
        
        for (const file of interactionFiles) {
          try {
            const interaction = (await import(`../interactions/${type}/${file}`)).default;
            
            if (!interaction.name || !interaction.execute) {
              logger.warn(`Interaction ${file} in ${type} is missing required properties.`);
              continue;
            }
            
            client[type].set(interaction.name, interaction);
            logger.info(`Loaded ${type.slice(0, -1)}: ${interaction.name}`);
          } catch (error) {
            logger.error(`Error loading interaction ${file} in ${type}:`, error);
          }
        }
        
        logger.info(`Loaded ${interactionFiles.length} ${type}`);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          logger.error(`Error loading ${type}:`, error);
        } else {
          logger.warn(`No ${type} directory found, skipping...`);
        }
      }
    }
  } catch (error) {
    logger.error('Error loading interactions:', error);
  }
};

