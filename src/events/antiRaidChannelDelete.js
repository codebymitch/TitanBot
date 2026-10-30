import { Events } from 'discord.js';
import { inspectChannelDelete } from '../utils/antiRaid.js';

export default {
  name: Events.ChannelDelete,
  async execute(channel) {
    if (channel.guild) await inspectChannelDelete(channel);
  },
};
