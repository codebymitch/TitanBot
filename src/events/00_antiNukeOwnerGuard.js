import { Events } from 'discord.js';

// Trust commands are handled at the start of messageCreate.js so they are
// consumed before any other MessageCreate listener can modify the message.
export default { name: Events.MessageCreate, once: false, async execute() {} };
