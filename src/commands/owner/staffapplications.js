import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getStaffApplicationsOpen, setStaffApplicationsOpen, STAFF_APPLICATION_GUILD_ID } from '../../services/staffApplicationService.js';
import { BOT_OWNER_USER_ID } from '../../config/owner.js';

export default {
  data: new SlashCommandBuilder()
    .setName('staffapplications')
    .setDescription('ניהול פתיחה וסגירה של בקשות הצוות באתר')
    .setDMPermission(false)
    .addSubcommand(subcommand => subcommand.setName('open').setDescription('פתיחת בקשות הצוות באתר'))
    .addSubcommand(subcommand => subcommand.setName('close').setDescription('סגירת בקשות הצוות באתר'))
    .addSubcommand(subcommand => subcommand.setName('status').setDescription('בדיקת מצב בקשות הצוות באתר')),

  async execute(interaction, client) {
    if (interaction.guildId !== STAFF_APPLICATION_GUILD_ID || interaction.user.id !== BOT_OWNER_USER_ID) {
      return interaction.reply({ content: 'רק בעל שרת EditIL יכול להשתמש בפקודה הזאת.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const action = interaction.options.getSubcommand();
      const open = action === 'status' ? await getStaffApplicationsOpen(client) : await setStaffApplicationsOpen(client, action === 'open');
      return interaction.editReply(open
        ? '✅ בקשות הצוות פתוחות עכשיו והטופס באתר זמין.'
        : '🔒 בקשות הצוות סגורות עכשיו ולא ניתן לשלוח טפסים באתר.');
    } catch (error) {
      client.logger?.error?.('Failed to update staff application availability', { error: error.message });
      return interaction.editReply('לא ניתן לעדכן את מצב בקשות הצוות כרגע. נסו שוב מאוחר יותר.');
    }
  }
};
