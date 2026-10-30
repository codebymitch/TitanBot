import { Events } from 'discord.js';
import { inspectMemberRemoval } from '../utils/antiRaid.js';

export default {
  name: Events.GuildBanAdd,
  async execute(ban) {
    await inspectMemberRemoval(ban, Events.GuildBanAdd);
  },
};
