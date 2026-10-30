import { Events } from 'discord.js';

// Trust commands are handled by 00_antiNukeOwnerGuard.js.
export default { name: Events.MessageCreate, once: false, async execute() {} };
