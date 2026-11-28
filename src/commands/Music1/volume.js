import { SlashCommandBuilder } from 'discord.js';
import {
  setVolume,
  replyMusicError,
  replyMusicSuccess,
} from '../../services/music/musicActions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('تغيير مستوى الصوت (0 إلى 200)')
    .addIntegerOption((opt) =>
      opt
        .setName('level')
        .setDescription('نسبة الصوت من 0 إلى 200')
        .setMinValue(0)
        .setMaxValue(200)
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return replyMusicError(interaction, 'هذا الأمر يعمل داخل السيرفرات فقط.', true);
    }

    const level = interaction.options.getInteger('level', true);

    try {
      const result = await setVolume(interaction.guildId, level);

      if (result === false || result === null || typeof result === 'undefined') {
        return replyMusicError(interaction, 'تعذر ضبط مستوى الصوت؛ تأكد من وجود مشغل نشط.', true);
      }

      const finalLevel = typeof result === 'number' ? result : level;
      const icon = finalLevel === 0 ? '🔇' : '🔊';

      return replyMusicSuccess(
        interaction,
        `${icon} تم ضبط مستوى الصوت على **${finalLevel}%**.`
      );
    } catch (error) {
      console.error('Error in /volume command:', error);
      return replyMusicError(interaction, 'حدث خطأ أثناء تغيير مستوى الصوت.', true);
    }
  },
};
