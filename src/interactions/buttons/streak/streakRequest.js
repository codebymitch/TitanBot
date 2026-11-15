import { streakAcceptHandler, streakDeclineHandler } from '../../../handlers/streakButtons.js';

function fromCustomId(handler) {
  return {
    name: handler.customId,
    execute: handler.execute,
  };
}

export default [
  fromCustomId(streakAcceptHandler),
  fromCustomId(streakDeclineHandler),
];
