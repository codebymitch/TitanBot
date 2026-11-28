import { SlashCommandBuilder } from 'discord.js';
import { buildNowPlayingReply } from '../../services/music/musicActions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('عرض المقطع قيد التشغيل حالياً'),

  async execute(interaction) {
    const payload = buildNowPlayingReply(interaction.guildId);
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(payload);
    }
    return interaction.reply(payload);
  },
};
