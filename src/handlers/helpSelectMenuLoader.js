import { helpCategorySelectMenu } from './helpSelectMenus.js';
import { logger } from '../utils/logger.js';

/**
 * Load help select menu handlers
 * @param {Client} client - Discord client
 */
export default function loadHelpSelectMenus(client) {
    client.selectMenus.set(helpCategorySelectMenu.name, helpCategorySelectMenu);

    if (process.env.NODE_ENV !== 'production') {
        logger.debug('Help select menu handlers loaded');
    }
}


