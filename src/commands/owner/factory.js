import { ChannelType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getConfig, updateConfig } from '../../modules/community/store.js';
import { requireAccess, AccessLevel } from '../../modules/community/permissions.js';
import { reloadCommand } from '../../handlers/commandLoader.js';

export function ownerCommand(name) {
  const data = new SlashCommandBuilder().setName(name).setDescription(`EditIL ${name}`).setDMPermission(false);
  if (name === 'reload') data.addStringOption(o => o.setName('command').setDescription('Command name').setRequired(true));
  if (name === 'config') data.addStringOption(o => o.setName('command').setDescription('Command permission key')).addIntegerOption(o => o.setName('level').setDescription('Access level 0-5').setMinValue(0).setMaxValue(5)).addChannelOption(o => o.setName('suggestions').setDescription('Suggestions channel').addChannelTypes(ChannelType.GuildText)).addChannelOption(o => o.setName('reports').setDescription('Reports channel').addChannelTypes(ChannelType.GuildText)).addChannelOption(o => o.setName('feedback').setDescription('Feedback channel').addChannelTypes(ChannelType.GuildText));
  return { data, async execute(i, client) {
    if (!await requireAccess(i, client, AccessLevel.OWNER)) return;
    if (name === 'reload') {
      const result = await reloadCommand(client, i.options.getString('command'));
      return i.reply({ content: result.success ? 'הפקודה נטענה מחדש בהצלחה.' : 'טעינת הפקודה נכשלה. השגיאה נרשמה לבדיקה.', flags: MessageFlags.Ephemeral });
    }
    const config = await getConfig(client, i.guildId);
    if (name === 'config') {
      const channels = { ...config.channels }; const commandPermissions = { ...config.commandPermissions };
      for (const key of ['suggestions', 'reports', 'feedback']) { const channel = i.options.getChannel(key); if (channel) channels[key] = channel.id; }
      const command = i.options.getString('command'); const level = i.options.getInteger('level');
      if (command && level !== null) commandPermissions[command] = level;
      await updateConfig(client, i.guildId, { channels, commandPermissions });
      return i.reply({ content: 'הגדרות השרת עודכנו.', flags: MessageFlags.Ephemeral });
    }
    if (name === 'debug') {
      const status = client.db.getStatus();
      const failed = client.failedCommands?.size || 0;
      return i.reply({ embeds: [createEmbed({ title: 'אבחון הבוט', description: `Discord: **${client.isReady() ? 'מחובר' : 'לא מחובר'}**\nמסד נתונים: **${status.connectionType}**\nמצב זמני: **${status.isDegraded ? 'כן' : 'לא'}**\nפקודות: **${client.commands.size}**\nמודולים שנכשלו: **${failed}**\nPing: **${Math.round(client.ws.ping)}ms**`, color: status.isDegraded || failed ? 'warning' : 'success' })], flags: MessageFlags.Ephemeral });
    }
    return i.reply({ embeds: [createEmbed({ title: 'הגדרת EditIL Assistant', description: 'השתמשו בפקודות ההגדרה הייעודיות לערוצים, תפקידים ומודולים. רק בעל השרת יכול לבצע הגדרה זו.', color: 'primary' })], flags: MessageFlags.Ephemeral });
  } };
}
