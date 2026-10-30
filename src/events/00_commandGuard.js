import { Events } from 'discord.js';

// Commands are only recognised as the first word of a message, so a command word in the
// middle of normal chat is already ignored. Permission checks live in each command and
// reply with a "no permission" message, so this listener no longer needs to blank messages.
export default {
  name: Events.MessageCreate,
  once: false,
  async execute() {},
};
