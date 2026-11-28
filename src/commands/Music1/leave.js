import { SlashCommandBuilder } from 'discord.js';
import { destroyPlayerSession, replyMusicSuccess } from '../../services/music/musicActions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('مغادرة الروم الصوتي وإنهاء جلسة التشغيل'),

  async execute(interaction) {
    destroyPlayerSession(interaction.guildId);
    return replyMusicSuccess(interaction, '👋 تم مغادرة الروم الصوتي.');
  },
};
