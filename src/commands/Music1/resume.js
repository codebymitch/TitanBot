import { SlashCommandBuilder } from 'discord.js';
import { resumePlayback, replyMusicError, replyMusicSuccess } from '../../services/music/musicActions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('استئناف التشغيل المتوقف مؤقتاً'),

  async execute(interaction) {
    const ok = resumePlayback(interaction.guildId);
    if (!ok) {
      return replyMusicError(interaction, 'لا يوجد مقطع متوقف مؤقتاً لاستئنافه.', true);
    }
    return replyMusicSuccess(interaction, '▶️ تم استئناف التشغيل.');
  },
};
