import { SlashCommandBuilder } from 'discord.js';
import { setLoopMode, replyMusicError, replyMusicSuccess } from '../../services/music/musicActions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('تفعيل أو إيقاف وضع التكرار')
    .addStringOption((opt) =>
      opt
        .setName('mode')
        .setDescription('on أو off')
        .addChoices(
          { name: 'On', value: 'on' },
          { name: 'Off', value: 'off' }
        )
    ),

  async execute(interaction) {
    const mode = interaction.options.getString('mode');
    const enabled = setLoopMode(interaction.guildId, mode);
    if (typeof enabled !== 'boolean') {
      return replyMusicError(interaction, 'لا يوجد مشغل نشط في هذا السيرفر.', true);
    }
    return replyMusicSuccess(interaction, enabled ? '🔁 تم تفعيل التكرار.' : '➡️ تم إيقاف التكرار.');
  },
};
