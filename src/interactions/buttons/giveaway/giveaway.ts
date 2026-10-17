import {
  giveawayJoinHandler,
  giveawayEndHandler,
  giveawayRerollHandler,
  giveawayViewHandler,
} from '../../../handlers/giveawayButtons.js';
import type { ButtonHandler } from '../../../types/index.js';

function fromCustomId(handler: { customId: string; execute: ButtonHandler['execute'] }): ButtonHandler {
  return {
    name: handler.customId,
    execute: handler.execute,
  };
}

export default [
  fromCustomId(giveawayJoinHandler),
  fromCustomId(giveawayEndHandler),
  fromCustomId(giveawayRerollHandler),
  fromCustomId(giveawayViewHandler),
] satisfies ButtonHandler[];
