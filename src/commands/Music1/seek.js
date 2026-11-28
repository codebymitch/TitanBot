import { SlashCommandBuilder } from 'discord.js';
import { seekTrack, replyMusicError, replyMusicSuccess } from '../../services/music/musicActions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('seek')
    .setDescription('الانتقال إلى وقت محدد داخل المقطع (مثال: 1:30 أو 90)')
    .addStringOption((opt) =>
      opt
        .setName('position')
        .setDescription('الوقت بالثواني أو بصيغة mm:ss')
        .setRequired(true)
    ),

  async execute(interaction) {
    const position = interaction.options.getString('position', true);
    const sec = seekTrack(interaction.guildId, position);
    if (sec === false) {
      return replyMusicError(interaction, 'تعذر الانتقال إلى الوقت المحدد أو لا يوجد مقطع نشط.', true);
    }
    return replyMusicSuccess(interaction, `⏩ تم الانتقال إلى الثانية **${sec}**.`);
  },
};
