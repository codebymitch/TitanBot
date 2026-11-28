import { SlashCommandBuilder } from 'discord.js';
import { handlePlay, replyMusicError } from '../../services/music/music.js';

export default {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('تشغيل مقطع صوتي أو إضافته إلى قائمة الانتظار')
    .addStringOption((opt) =>
      opt
        .setName('query')
        .setDescription('اسم المقطع أو رابط يوتيوب أو سبوتيفاي')
        .setRequired(true)
    ),

  async execute(interaction) {
    const query = interaction.options.getString('query', true);
    await interaction.deferReply();
    try {
      await handlePlay(interaction, query);
    } catch (err) {
      await replyMusicError(interaction, err?.message || 'حدث خطأ أثناء تشغيل المقطع.', true);
    }
  },
};
