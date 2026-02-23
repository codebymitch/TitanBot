import { giveawayJoinHandler, giveawayEndHandler, giveawayRerollHandler, giveawayViewHandler } from './giveawayButtons.js';
import { logger } from '../utils/logger.js';





export function loadGiveawayButtons(client) {
  try {
    client.buttons.set(giveawayJoinHandler.customId, giveawayJoinHandler);
    client.buttons.set(giveawayEndHandler.customId, giveawayEndHandler);
    client.buttons.set(giveawayRerollHandler.customId, giveawayRerollHandler);
    client.buttons.set(giveawayViewHandler.customId, giveawayViewHandler);

    if (process.env.NODE_ENV !== 'production') {
      logger.debug('Giveaway button handlers loaded');
    }
  } catch (error) {
    logger.error('Error loading giveaway button handlers:', error);
  }
}


