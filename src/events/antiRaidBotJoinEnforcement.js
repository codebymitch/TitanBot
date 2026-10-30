import { Events } from 'discord.js';
import { handleUntrustedBotJoin } from '../utils/antiRaidBots.js';

export default {
  name: Events.GuildMemberAdd,
  once: false,
  async execute(member) {
    await handleUntrustedBotJoin(member);
  },
};
