import { SlashCommandBuilder } from 'discord.js';
import { clearQueue, replyMusicError, replyMusicSuccess } from '../../services/music/musicActions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('مسح جميع المقاطع من قائمة الانتظار'),

  async execute(interaction) {
    const ok = clearQueue(interaction.guildId);
    if (!ok) {
      return replyMusicError(interaction, 'لا توجد قائمة انتظار نشطة لمسحها.', true);
    }
    return replyMusicSuccess(interaction, '🧹 تم مسح قائمة الانتظار.');
  },
};
