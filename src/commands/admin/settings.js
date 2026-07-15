import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { getConfig, resetConfig } from '../../modules/community/store.js';
import { info, success } from '../../modules/community/ui.js';
export default { data: new SlashCommandBuilder().setName('settings').setDescription('Manage bot settings').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(s => s.setName('view').setDescription('View current settings'))
  .addSubcommand(s => s.setName('reset').setDescription('Reset bot settings for this server')),
  async execute(interaction, client) { const sub = interaction.options.getSubcommand(); if (sub === 'reset') { await resetConfig(client, interaction.guildId); return interaction.reply(success('ההגדרות אופסו', 'הבוט חזר להגדרות ברירת המחדל.')); } const c = await getConfig(client, interaction.guildId); return interaction.reply(info('הגדרות השרת', `מערכת קבלת פנים: **${c.welcome.enabled ? 'פעילה' : 'כבויה'}**\nאימות: **${c.verification.enabled ? 'פעיל' : 'כבוי'}**\nפניות: **${c.tickets.enabled ? 'פעילות' : 'כבויות'}**\nלוגים: **${c.logging.enabled ? 'פעילים' : 'כבויים'}**\nרמות: **${c.leveling.enabled ? 'פעילות' : 'כבויות'}**`)); } };
