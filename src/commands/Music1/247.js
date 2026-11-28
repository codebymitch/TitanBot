import { SlashCommandBuilder } from 'discord.js';
import { setTwentyFourSeven, replyMusicError, replyMusicSuccess } from '../../services/music/musicActions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('247')
    .setDescription('تفعيل أو تعطيل وضع البقاء 24/7 في الروم الصوتي')
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
    const enabled = setTwentyFourSeven(interaction.guildId, mode);
    if (typeof enabled !== 'boolean') {
      return replyMusicError(interaction, 'تعذر تغيير وضع 24/7.', true);
    }
    return replyMusicSuccess(
      interaction,
      enabled ? '🌙 تم تفعيل وضع **24/7**.' : '☀️ تم تعطيل وضع **24/7**.'
    );
  },
};
