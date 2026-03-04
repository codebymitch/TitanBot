import {
  giveawayJoinHandler,
  giveawayEndHandler,
  giveawayRerollHandler,
  giveawayViewHandler,
} from '../../handlers/giveawayButtons.js';

function fromCustomId(handler) {
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
];