import { Events } from 'discord.js';
import { inspectRoleCreate } from '../utils/antiRaid.js';

export default {
  name: Events.GuildRoleCreate,
  async execute(role) {
    await inspectRoleCreate(role);
  },
};
