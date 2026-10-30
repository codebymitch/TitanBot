import { Events } from 'discord.js';
import { handleMemberJoinInvite } from '../services/inviteTrackerService.js';

export default {
  name: Events.GuildMemberAdd,
  once: false,
  async execute(member) {
    if (member.user?.bot) return;
    await handleMemberJoinInvite(member);
  },
};
