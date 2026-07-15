import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { getConfig, resetConfig, updateConfig } from '../../modules/community/store.js';
import { EVENT_TYPES, logEvent } from '../../services/loggingService.js';
import { info, success } from '../../modules/community/ui.js';
import { createSettingsPage, createSettingsComponents } from '../../services/settingsOverview.js';

const groups = {
  message_sent: [EVENT_TYPES.MESSAGE_CREATE], message_edit: [EVENT_TYPES.MESSAGE_EDIT], message_delete: [EVENT_TYPES.MESSAGE_DELETE], bulk_delete: [EVENT_TYPES.MESSAGE_BULK_DELETE],
  member_join: [EVENT_TYPES.MEMBER_JOIN], member_leave: [EVENT_TYPES.MEMBER_LEAVE], moderation: [EVENT_TYPES.MODERATION_BAN, EVENT_TYPES.MODERATION_UNBAN, EVENT_TYPES.MODERATION_KICK, EVENT_TYPES.MODERATION_MUTE],
  member_update: [EVENT_TYPES.MEMBER_UPDATE], channels: [EVENT_TYPES.CHANNEL_CHANGE], roles: [EVENT_TYPES.ROLE_CREATE, EVENT_TYPES.ROLE_DELETE, EVENT_TYPES.ROLE_UPDATE], voice: [EVENT_TYPES.VOICE_CHANGE], invites: [EVENT_TYPES.INVITE_CHANGE], emoji_stickers: [EVENT_TYPES.EMOJI_STICKER_CHANGE], server_update: [EVENT_TYPES.SERVER_UPDATE]
};
const choices = Object.keys(groups).map(name => ({ name, value: name }));

export default { data: new SlashCommandBuilder().setName('settings').setDescription('Manage bot settings').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(s => s.setName('view').setDescription('View current settings'))
  .addSubcommand(s => s.setName('reset').setDescription('Reset bot settings for this server'))
  .addSubcommand(s => s.setName('logging').setDescription('View or change individual logging events')
    .addStringOption(o => o.setName('action').setDescription('Action').setRequired(true).addChoices({name:'view',value:'view'},{name:'enable',value:'enable'},{name:'disable',value:'disable'},{name:'channel',value:'channel'},{name:'test',value:'test'}))
    .addStringOption(o => o.setName('event').setDescription('Event group for enable/disable').addChoices(...choices))
    .addChannelOption(o => o.setName('channel').setDescription('Logging channel').addChannelTypes(ChannelType.GuildText))),
  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'reset') { await resetConfig(client, interaction.guildId); return interaction.reply({ ...success('ההגדרות אופסו', 'הבוט חזר להגדרות ברירת המחדל.'), flags: MessageFlags.Ephemeral }); }
    const config = await getConfig(client, interaction.guildId);
    if (sub === 'view') return interaction.reply({ embeds: [createSettingsPage(config)], components: createSettingsComponents(interaction.user.id), flags: MessageFlags.Ephemeral });
    if (interaction.user.id !== interaction.guild.ownerId) return interaction.reply({ content: 'רק בעל השרת יכול לשנות את הגדרות הלוגים.', flags: MessageFlags.Ephemeral });
    const action = interaction.options.getString('action'), event = interaction.options.getString('event'), channel = interaction.options.getChannel('channel');
    if (action === 'view') { const lines = Object.entries(groups).map(([name, types]) => `${types.every(t => config.logging.enabledEvents?.[t] !== false) ? '✅' : '❌'} ${name}`); return interaction.reply({ ...info('הגדרות לוגים', `ערוץ: ${config.logging.channelId ? `<#${config.logging.channelId}>` : 'לא הוגדר'}\n${lines.join('\n')}`), flags: MessageFlags.Ephemeral }); }
    if (action === 'channel') { if (!channel) return interaction.reply({ content: 'יש לבחור ערוץ.', flags: MessageFlags.Ephemeral }); await updateConfig(client, interaction.guildId, { logging: { enabled: true, channelId: channel.id } }); return interaction.reply({ ...success('ערוץ הלוגים עודכן', `הלוגים יישלחו אל ${channel}.`), flags: MessageFlags.Ephemeral }); }
    if (action === 'test') { const result = await logEvent({ client, guildId: interaction.guildId, eventType: EVENT_TYPES.SETTINGS_CHANGE, data: { title: '✅ בדיקת מערכת הלוגים', description: 'מערכת הלוגים פועלת והערוץ מוגדר כראוי.' } }); return interaction.reply({ content: result.ok ? 'בדיקת הלוגים נשלחה.' : `הבדיקה נכשלה: ${result.reason}`, flags: MessageFlags.Ephemeral }); }
    if (!event) return interaction.reply({ content: 'יש לבחור סוג אירוע להפעלה או כיבוי.', flags: MessageFlags.Ephemeral });
    const enabledEvents = { ...(config.logging.enabledEvents || {}) }; for (const type of groups[event]) enabledEvents[type] = action === 'enable';
    await updateConfig(client, interaction.guildId, { logging: { enabled: true, enabledEvents } });
    return interaction.reply({ ...success('הגדרות הלוגים עודכנו', `${event}: ${action === 'enable' ? 'פעיל' : 'כבוי'}`), flags: MessageFlags.Ephemeral });
  }
};
