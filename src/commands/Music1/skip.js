import { SlashCommandBuilder } from 'discord.js';
import { handleSkip } from '../../services/music/music.js';

export default {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('تخطي المقطع الحالي والانتقال للتالي'),

  async execute(interaction) {
    await handleSkip(interaction);
  },
};
