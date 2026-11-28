import { SlashCommandBuilder } from 'discord.js';
import { pausePlayback, replyMusicError, replyMusicSuccess } from '../../services/music/music.js';

export default {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('إيقاف التشغيل مؤقتاً'),

  async execute(interaction) {
    const ok = pausePlayback(interaction);
    if (!ok) {
      return replyMusicError(interaction, 'لا يوجد مقطع قيد التشغيل لإيقافه مؤقتاً.', true);
    }
    return replyMusicSuccess(interaction, '⏸️ تم إيقاف التشغيل مؤقتاً.');
  },
};
