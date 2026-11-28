import { SlashCommandBuilder } from 'discord.js';
import {
  setLoopMode,
  replyMusicError,
  replyMusicSuccess,
} from '../../services/music/musicActions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('تفعيل أو إيقاف وضع التكرار (أو التبديل تلقائياً)')
    .addStringOption((opt) =>
      opt
        .setName('mode')
        .setDescription('اختر On أو Off (اختياري)')
        .setRequired(false)
        .addChoices(
          { name: 'On', value: 'on' },
          { name: 'Off', value: 'off' }
        )
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return replyMusicError(interaction, 'هذا الأمر يعمل داخل السيرفرات فقط.', true);
    }

    const mode = interaction.options.getString('mode'); // 'on' | 'off' | null

    try {
      const enabled = await setLoopMode(interaction.guildId, mode);

      if (typeof enabled !== 'boolean') {
        return replyMusicError(interaction, 'لا يوجد مشغل نشط في هذا السيرفر.', true);
      }

      return replyMusicSuccess(
        interaction,
        enabled ? '🔁 تم تفعيل وضع التكرار.' : '➡️ تم إيقاف وضع التكرار.'
      );
    } catch (error) {
      console.error('Error in /loop command:', error);
      return replyMusicError(interaction, 'حدث خطأ أثناء تغيير وضع التكرار.', true);
    }
  },
};
