import { SlashCommandBuilder } from 'discord.js';
import { handleStop } from '../../services/music/musicActions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('إيقاف التشغيل ومسح قائمة الانتظار ومغادرة الروم الصوتي'),

  async execute(interaction) {
    await handleStop(interaction);
  },
};
