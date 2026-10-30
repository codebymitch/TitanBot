import { Events } from 'discord.js';
import { inspectMemberRemoval } from '../utils/antiRaid.js';

export default {
  name: Events.GuildMemberRemove,
  async execute(member) {
    await inspectMemberRemoval(member);
  },
};
