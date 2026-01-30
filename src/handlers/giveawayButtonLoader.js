import { giveawayJoinHandler, giveawayEndHandler, giveawayRerollHandler } from './giveawayButtons.js';

export function loadGiveawayButtons(client) {
  // Register giveaway button handlers
  client.buttons.set(giveawayJoinHandler.customId, giveawayJoinHandler);
  client.buttons.set(giveawayEndHandler.customId, giveawayEndHandler);
  client.buttons.set(giveawayRerollHandler.customId, giveawayRerollHandler);
  
  console.log('Giveaway button handlers loaded');
}
