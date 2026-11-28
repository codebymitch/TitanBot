import { SlashCommandBuilder } from 'discord.js';
import { handleStop, replyMusicError } from '../../services/music/musicActions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('إيقاف التشغيل ومسح قائمة الانتظار ومغادرة الروم الصوتي'),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return replyMusicError(interaction, 'هذا الأمر يعمل داخل السيرفرات فقط.', true);
    }

    try {
      await handleStop(interaction);
    } catch (error) {
      console.error('Error in /stop command:', error);
      await replyMusicError(interaction, 'تعذر إيقاف التشغيل حالياً.', true);
    }
  },
};
