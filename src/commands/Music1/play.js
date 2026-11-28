import { SlashCommandBuilder } from 'discord.js';
import { playQuery, replyMusicError } from '../../services/music/musicActions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('تشغيل مقطع أو إضافته إلى قائمة الانتظار')
    .addStringOption((opt) =>
      opt
        .setName('query')
        .setDescription('اسم الأغنية أو رابط أو قائمة تشغيل')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return replyMusicError(interaction, 'هذا الأمر يعمل داخل السيرفرات فقط.', true);
    }

    const query = interaction.options.getString('query', true).trim();
    if (!query) {
      return replyMusicError(interaction, 'اكتب اسم مقطع أو رابطاً صحيحاً.', true);
    }

    const memberVoiceChannel = interaction.member?.voice?.channel;
    if (!memberVoiceChannel) {
      return replyMusicError(interaction, 'يجب أن تكون داخل روم صوتي أولاً لتشغيل الموسيقى.', true);
    }

    const botVoiceChannel = interaction.guild.members.me?.voice?.channel;
    if (botVoiceChannel && botVoiceChannel.id !== memberVoiceChannel.id) {
      return replyMusicError(
        interaction,
        `البوت مشغول حالياً في الروم الصوتي **${botVoiceChannel.name}**.`,
        true
      );
    }

    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }
    } catch (deferErr) {
      console.error('Error deferring /play interaction:', deferErr);
      return;
    }

    try {
      await playQuery(interaction, query);
    } catch (err) {
      console.error('Error in /play command:', err);
      await replyMusicError(interaction, err?.message || 'حدث خطأ أثناء تشغيل المقطع.', true);
    }
  },
};
