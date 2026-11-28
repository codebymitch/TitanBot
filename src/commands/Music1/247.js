import { SlashCommandBuilder } from 'discord.js';
import {
  setTwentyFourSeven,
  replyMusicError,
  replyMusicSuccess,
} from '../../services/music/musicActions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('247')
    .setDescription('تفعيل أو تعطيل وضع البقاء 24/7 في الروم الصوتي (أو التبديل تلقائياً)')
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
      const enabled = await setTwentyFourSeven(interaction.guildId, mode);

      if (typeof enabled !== 'boolean') {
        return replyMusicError(interaction, 'تعذر تغيير وضع 24/7.', true);
      }

      return replyMusicSuccess(
        interaction,
        enabled
          ? '🌙 تم تفعيل وضع **24/7**؛ سيبقى البوت متصلاً بالروم الصوتي.'
          : '☀️ تم تعطيل وضع **24/7**.'
      );
    } catch (error) {
      console.error('Error in /247 command:', error);
      return replyMusicError(interaction, 'حدث خطأ أثناء تحديث وضع 24/7.', true);
    }
  },
};
