import { SlashCommandBuilder } from 'discord.js';
import { pausePlayback, replyMusicError, replyMusicSuccess } from '../../services/music/musicActions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('إيقاف التشغيل مؤقتاً'),

  async execute(interaction) {
    const ok = pausePlayback(interaction.guildId);
    if (!ok) {
      return replyMusicError(interaction, 'لا يوجد مقطع قيد التشغيل لإيقافه مؤقتاً.', true);
    }
    return replyMusicSuccess(interaction, '⏸️ تم إيقاف التشغيل مؤقتاً.');
  },
};
