import { SlashCommandBuilder } from 'discord.js';
import { playQuery, replyMusicError } from '../../services/music/musicActions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('تشغيل مقطع أو إضافته إلى قائمة الانتظار')
    .addStringOption((opt) =>
      opt
        .setName('query')
        .setDescription('اسم الأغنية أو رابط يوتيوب')
        .setRequired(true)
    ),

  async execute(interaction) {
    const query = interaction.options.getString('query', true).trim();
    if (!query) {
      return replyMusicError(interaction, 'اكتب اسم مقطع أو رابطاً صحيحاً.', true);
    }

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    try {
      await playQuery(interaction, query);
    } catch (err) {
      await replyMusicError(interaction, err?.message || 'حدث خطأ أثناء التشغيل.', true);
    }
  },
};
