import { SlashCommandBuilder } from 'discord.js';
import {
  buildNowPlayingReply,
  replyMusicError,
} from '../../services/music/musicActions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('عرض المقطع قيد التشغيل حالياً مع أزرار التحكم'),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return replyMusicError(interaction, 'هذا الأمر يعمل داخل السيرفرات فقط.', true);
    }

    try {
      const payload = await buildNowPlayingReply(interaction.guildId);

      if (!payload) {
        return replyMusicError(interaction, 'لا يوجد مقطع قيد التشغيل حالياً.', true);
      }

      if (interaction.deferred || interaction.replied) {
        return await interaction.editReply(payload);
      }

      return await interaction.reply(payload);
    } catch (error) {
      console.error('Error in /nowplaying command:', error);
      return replyMusicError(interaction, 'تعذر عرض المقطع قيد التشغيل حالياً.', true);
    }
  },
};
