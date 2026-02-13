import { giveawayJoinHandler, giveawayEndHandler, giveawayRerollHandler } from './giveawayButtons.js';
import { logger } from '../utils/logger.js';

/**
 * Load giveaway button handlers
 * @param {Client} client - Discord client
 */
export function loadGiveawayButtons(client) {
  client.buttons.set(giveawayJoinHandler.customId, giveawayJoinHandler);
  client.buttons.set(giveawayEndHandler.customId, giveawayEndHandler);
  client.buttons.set(giveawayRerollHandler.customId, giveawayRerollHandler);
  
  if (process.env.NODE_ENV !== 'production') {
    logger.debug('Giveaway button handlers loaded');
  }
}


