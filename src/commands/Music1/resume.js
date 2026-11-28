import { SlashCommandBuilder } from 'discord.js';
import {
  resumePlayback,
  replyMusicError,
  replyMusicSuccess,
} from '../../services/music/musicActions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('استئناف التشغيل المتوقف مؤقتاً'),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return replyMusicError(interaction, 'هذا الأمر يعمل داخل السيرفرات فقط.', true);
    }

    try {
      const ok = await resumePlayback(interaction.guildId);

      if (!ok) {
        return replyMusicError(interaction, 'لا يوجد مقطع متوقف مؤقتاً لاستئنافه.', true);
      }

      return replyMusicSuccess(interaction, '▶️ تم استئناف التشغيل.');
    } catch (error) {
      console.error('Error in /resume command:', error);
      return replyMusicError(interaction, 'حدث خطأ أثناء محاولة استئناف التشغيل.', true);
    }
  },
};
