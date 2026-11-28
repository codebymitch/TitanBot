import { SlashCommandBuilder } from 'discord.js';
import { moveInQueue, replyMusicError, replyMusicSuccess } from '../../services/music/musicActions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('move')
    .setDescription('نقل مقطع إلى موضع آخر داخل قائمة الانتظار')
    .addIntegerOption((opt) =>
      opt.setName('from').setDescription('الترتيب الحالي (يبدأ من 1)').setMinValue(1).setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName('to').setDescription('الترتيب الجديد (يبدأ من 1)').setMinValue(1).setRequired(true)
    ),

  async execute(interaction) {
    const from = interaction.options.getInteger('from', true);
    const to = interaction.options.getInteger('to', true);
    const moved = moveInQueue(interaction.guildId, from, to);
    if (!moved) {
      return replyMusicError(interaction, 'تعذر نقل المقطع، تأكد من صحة الأرقام.', true);
    }
    return replyMusicSuccess(interaction, `↕️ تم نقل **${moved.title}** إلى المركز **${to}**.`);
  },
};
