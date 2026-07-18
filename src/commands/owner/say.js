import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { OWNER_INBOX_USER_ID } from '../../services/ownerInboxService.js';
import logger from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('שליחת הודעה בערוץ הנוכחי בשם הבוט')
    .setDMPermission(false)
    .addStringOption(option => option
      .setName('message')
      .setDescription('הטקסט שהבוט ישלח')
      .setRequired(true)
      .setMaxLength(2000)),

  async execute(interaction) {
    if (interaction.user.id !== OWNER_INBOX_USER_ID) {
      return interaction.reply({
        content: 'רק בעל הבוט יכול להשתמש בפקודה הזאת.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!interaction.channel?.isTextBased()) {
      return interaction.reply({
        content: 'לא ניתן לשלוח הודעה בערוץ הזה.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const content = interaction.options.getString('message', true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const message = await interaction.channel.send({
        content,
        allowedMentions: { parse: [], users: [], roles: [] },
      });
      logger.info('Owner sent a message as the bot', {
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId: interaction.user.id,
        messageId: message.id,
      });
      return interaction.editReply(`ההודעה נשלחה בהצלחה: ${message.url}`);
    } catch (error) {
      logger.error('Failed to send owner message as the bot', {
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId: interaction.user.id,
        error: error.stack || error.message,
      });
      return interaction.editReply('לא ניתן היה לשלוח את ההודעה. בדקו את הרשאות הבוט בערוץ.');
    }
  },
};
