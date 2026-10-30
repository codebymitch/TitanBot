import { Events } from 'discord.js';
import { inspectRoleUpdate } from '../utils/antiRaid.js';

export default {
  name: Events.GuildRoleUpdate,
  async execute(oldRole, newRole) {
    await inspectRoleUpdate(newRole);
  },
};
