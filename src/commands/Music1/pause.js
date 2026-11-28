import { SlashCommandBuilder } from 'discord.js';
import {
  pausePlayback,
  replyMusicError,
  replyMusicSuccess,
} from '../../services/music/musicActions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('إيقاف التشغيل مؤقتاً'),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return replyMusicError(interaction, 'هذا الأمر يعمل داخل السيرفرات فقط.', true);
    }

    try {
      const ok = await pausePlayback(interaction.guildId);

      if (!ok) {
        return replyMusicError(interaction, 'لا يوجد مقطع قيد التشغيل لإيقافه مؤقتاً.', true);
      }

      return replyMusicSuccess(interaction, '⏸️ تم إيقاف التشغيل مؤقتاً.');
    } catch (error) {
      console.error('Error in /pause command:', error);
      return replyMusicError(interaction, 'حدث خطأ أثناء محاولة إيقاف التشغيل مؤقتاً.', true);
    }
  },
};
