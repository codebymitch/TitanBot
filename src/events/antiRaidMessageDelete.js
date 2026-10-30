import { Events } from 'discord.js';
import { inspectMessageDelete } from '../utils/antiRaid.js';

export default {
  name: Events.MessageBulkDelete,
  async execute(messages, channel) {
    if (channel?.guild) await inspectMessageDelete(channel);
  },
};
