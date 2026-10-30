import { Events } from 'discord.js';

// Arabic commands are normal aliases handled by the regular prefix pipeline.
// Keeping this listener inert prevents commands from executing twice.
export default {
  name: Events.MessageCreate,
  once: false,
  async execute() {},
};
