import { SlashCommandBuilder } from 'discord.js';
import { removeFromQueue, replyMusicError, replyMusicSuccess } from '../../services/music/musicActions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('حذف مقطع من قائمة الانتظار حسب رقمه')
    .addIntegerOption((opt) =>
      opt
        .setName('position')
        .setDescription('رقم المقطع في القائمة (يبدأ من 1)')
        .setMinValue(1)
        .setRequired(true)
    ),

  async execute(interaction) {
    const position = interaction.options.getInteger('position', true);
    const removed = removeFromQueue(interaction.guildId, position);
    if (!removed) {
      return replyMusicError(interaction, 'رقم المقطع غير صحيح في قائمة الانتظار.', true);
    }
    return replyMusicSuccess(interaction, `🗑️ تم حذف **${removed.title}** من القائمة.`);
  },
};
