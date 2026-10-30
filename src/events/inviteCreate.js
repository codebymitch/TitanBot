import { Events } from 'discord.js';
import { rememberInvite } from '../services/inviteTrackerService.js';

export default {
  name: Events.InviteCreate,
  once: false,
  execute(invite) {
    rememberInvite(invite);
  },
};
