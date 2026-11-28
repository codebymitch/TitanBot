import { SlashCommandBuilder } from 'discord.js';
import { handleQueue } from '../../services/music/musicActions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('عرض قائمة الانتظار الحالية'),

  async execute(interaction) {
    await handleQueue(interaction);
  },
};
