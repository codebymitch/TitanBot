import { SlashCommandBuilder } from 'discord.js';
import { setVolume, replyMusicError, replyMusicSuccess } from '../../services/music/musicActions.js';

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
    const level = interaction.options.getInteger('level', true);
    const result = setVolume(interaction.guildId, level);
    if (result === false) {
      return replyMusicError(interaction, 'تعذر ضبط مستوى الصوت.', true);
    }
    return replyMusicSuccess(interaction, `🔊 تم ضبط مستوى الصوت على **${result}%**.`);
  },
};
