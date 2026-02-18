import { helpCategorySelectMenu } from './helpSelectMenus.js';
import { logger } from '../utils/logger.js';





export default function loadHelpSelectMenus(client) {
    try {
        client.selectMenus.set(helpCategorySelectMenu.name, helpCategorySelectMenu);

        if (process.env.NODE_ENV !== 'production') {
            logger.debug('Help select menu handlers loaded');
        }
    } catch (error) {
        logger.error('Error loading help select menu handlers:', error);
    }
}


