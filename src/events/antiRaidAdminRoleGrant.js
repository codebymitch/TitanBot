import { Events } from 'discord.js';
import { inspectAdminRoleGrant } from '../utils/antiRaid.js';

export default {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    await inspectAdminRoleGrant(oldMember, newMember);
  },
};
