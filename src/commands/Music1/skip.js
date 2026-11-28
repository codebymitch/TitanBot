import { SlashCommandBuilder } from 'discord.js';
import { handleSkip, replyMusicError } from '../../services/music/musicActions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('تخطي المقطع الحالي والانتقال للتالي'),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return replyMusicError(interaction, 'هذا الأمر يعمل داخل السيرفرات فقط.', true);
    }

    try {
      await handleSkip(interaction);
    } catch (error) {
      console.error('Error in /skip command:', error);
      await replyMusicError(interaction, 'تعذر تخطي المقطع الحالي.', true);
    }
  },
};
