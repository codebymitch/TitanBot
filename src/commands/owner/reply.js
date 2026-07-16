import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { OWNER_INBOX_USER_ID, replyToOwnerInboxCase } from '../../services/ownerInboxService.js';

export default {
  data: new SlashCommandBuilder().setName('reply').setDescription('תגובה פרטית למקרה של הצעה או דיווח')
    .addStringOption(option => option.setName('case_id').setDescription('מזהה המקרה, לדוגמה SUG-000001').setRequired(true).setMinLength(10).setMaxLength(10))
    .addStringOption(option => option.setName('message').setDescription('התגובה שתישלח למשתמש').setRequired(true).setMaxLength(1800))
    .addStringOption(option=>option.setName('status').setDescription('סטטוס חדש למקרה').addChoices({name:'התקבל',value:'received'},{name:'בבדיקה',value:'reviewing'},{name:'אושר',value:'accepted'},{name:'נדחה',value:'rejected'},{name:'טופל',value:'resolved'})),
  async execute(interaction, client) {
    if (interaction.user.id !== OWNER_INBOX_USER_ID) return interaction.reply({ content: 'אין לך הרשאה להשתמש בפקודה זו.', flags: MessageFlags.Ephemeral });
    const result = await replyToOwnerInboxCase(client, interaction.user.id,
      interaction.options.getString('case_id', true), interaction.options.getString('message', true), interaction.options.getString('status'));
    return interaction.reply({ content: result.message, flags: MessageFlags.Ephemeral });
  }
};
