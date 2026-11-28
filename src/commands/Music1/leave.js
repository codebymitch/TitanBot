import { SlashCommandBuilder } from 'discord.js';
import {
  destroyPlayerSession,
  replyMusicError,
  replyMusicSuccess,
} from '../../services/music/musicActions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('مغادرة الروم الصوتي وإنهاء جلسة التشغيل'),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return replyMusicError(interaction, 'هذا الأمر يعمل داخل السيرفرات فقط.', true);
    }

    const botVoiceChannel = interaction.guild.members.me?.voice?.channel;
    if (!botVoiceChannel) {
      return replyMusicError(interaction, 'البوت ليس متصلاً بأي روم صوتي حالياً.', true);
    }

    try {
      const destroyed = await destroyPlayerSession(interaction.guildId);

      if (destroyed === false) {
        return replyMusicError(interaction, 'تعذر إنهاء جلسة التشغيل أو مغادرة الروم.', true);
      }

      return replyMusicSuccess(
        interaction,
        `👋 تم مغادرة الروم الصوتي **${botVoiceChannel.name}** وإنهاء جلسة التشغيل.`
      );
    } catch (error) {
      console.error('Error in /leave command:', error);
      return replyMusicError(interaction, 'حدث خطأ أثناء محاولة مغادرة الروم الصوتي.', true);
    }
  },
};
