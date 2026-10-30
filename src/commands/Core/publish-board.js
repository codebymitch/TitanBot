import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { publishStaffPermissionBoard } from '../../services/staffRoleHierarchyService.js';
import { publishArabicModerationCommands } from '../../services/moderationCommandsBoardService.js';
import { publishTrustedBoard } from '../../services/trustedBoardService.js';
import { publishRulesBoard } from '../../services/rulesBoardService.js';

// One command with subcommands keeps the bot under Discord's 100 global command limit.
export default {
  data: new SlashCommandBuilder()
    .setName('publish-board')
    .setDescription('Post a bot info board once (skipped if it already exists)')
    .addSubcommand((sub) => sub.setName('moderation-commands').setDescription('Post the Arabic moderation commands list'))
    .addSubcommand((sub) => sub.setName('admin-permissions').setDescription('Refresh the staff permission board (edit only)'))
    .addSubcommand((sub) => sub.setName('trusted').setDescription('Post or refresh the Anti-Nuke trusted list'))
    .addSubcommand((sub) => sub.setName('rules').setDescription('Post (with @everyone) or refresh the server rules')),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ هذا الأمر يعمل داخل السيرفر فقط.', ephemeral: true });
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: '❌ تحتاج إلى صلاحية Manage Server.', ephemeral: true });

    try {
      if (interaction.options.getSubcommand() === 'admin-permissions') {
        // Edit only: the bot doesn't post new messages in the permission channel.
        const result = await publishStaffPermissionBoard(interaction.guild);
        const content = {
          updated: `✅ تم تحديث رسالة الصلاحيات في الروم <#${result.channelId}>.`,
          missing: `ℹ️ رسالة الصلاحيات غير موجودة في الروم <#${result.channelId}>، والبوت لا يرسل رسائل جديدة هناك.`,
        }[result.status] || `ℹ️ لم يتم العثور على رتب الستاف.`;
        return interaction.reply({ content, ephemeral: true });
      } else if (interaction.options.getSubcommand() === 'trusted') {
        const result = await publishTrustedBoard(interaction.client, { allowSend: true });
        const verb = result.status === 'sent' ? 'إرسال' : 'تحديث';
        return interaction.reply({ content: `✅ تم ${verb} قائمة الـ Trusted في الروم <#${result.channelId}>.`, ephemeral: true });
      } else if (interaction.options.getSubcommand() === 'rules') {
        const result = await publishRulesBoard(interaction.client);
        const content = {
          sent: `✅ تم إرسال القوانين في الروم <#${result.channelId}>.`,
          updated: `✅ تم تحديث القوانين في الروم <#${result.channelId}>.`,
        }[result.status] || `ℹ️ القوانين موجودة ومحدّثة بالفعل في الروم <#${result.channelId}>.`;
        return interaction.reply({ content, ephemeral: true });
      }
      const result = await publishArabicModerationCommands(interaction.client, { allowSend: true });
      const content = {
        sent: `✅ تم الإرسال في الروم <#${result.channelId}>.`,
        updated: `✅ تم تحديث الرسالة الموجودة في الروم <#${result.channelId}>.`,
      }[result.status] || `ℹ️ الرسالة موجودة بالفعل في الروم <#${result.channelId}>، لم يتم إرسال شيء جديد.`;
      await interaction.reply({ content, ephemeral: true });
    } catch (error) {
      await interaction.reply({ content: `❌ فشل الإرسال: ${error.message}`, ephemeral: true });
    }
  },
};
