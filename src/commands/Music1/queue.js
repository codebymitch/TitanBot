import { SlashCommandBuilder } from 'discord.js';
import { handleQueue, replyMusicError } from '../../services/music/musicActions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('عرض قائمة الانتظار الحالية')
    .addIntegerOption((opt) =>
      opt
        .setName('page')
        .setDescription('رقم الصفحة (اختياري)')
        .setMinValue(1)
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return replyMusicError(interaction, 'هذا الأمر يعمل داخل السيرفرات فقط.', true);
    }

    const page = interaction.options.getInteger('page') ?? 1;

    try {
      await handleQueue(interaction, page);
    } catch (error) {
      console.error('Error in /queue command:', error);
      await replyMusicError(interaction, 'تعذر عرض قائمة الانتظار حالياً.', true);
    }
  },
};
