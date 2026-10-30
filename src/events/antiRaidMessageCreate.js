import { Events } from 'discord.js';
import { handleAntiRaidCommand } from '../utils/antiRaid.js';

export default {
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.author?.bot && message.guild) await handleAntiRaidCommand(message);
  },
};
