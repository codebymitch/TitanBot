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
    .addChannelOption(o => o.setName('channel').setDescription('Logging channel').addChannelTypes(ChannelType.GuildText)))
  .addSubcommandGroup(g => g.setName('community').setDescription('Community module settings')
    .addSubcommand(s => s.setName('view').setDescription('View community settings'))
    .addSubcommand(s => s.setName('channel').setDescription('Configure a community channel')
      .addStringOption(o => o.setName('type').setDescription('Channel purpose').setRequired(true).addChoices(
        {name:'suggestions',value:'suggestions'},{name:'feedback',value:'feedback'},{name:'reports',value:'reports'},{name:'self-promotion',value:'selfPromotion'},{name:'looking-for-editor',value:'lookingForEditor'},{name:'looking-for-team',value:'lookingForTeam'}))
      .addChannelOption(o => o.setName('channel').setDescription('Selected channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand(s => s.setName('cooldown').setDescription('Configure a command cooldown')
      .addStringOption(o => o.setName('command').setDescription('Command').setRequired(true).addChoices(...['suggest','feedback','report','selfpromo','lookingforeditor','lookingforteam'].map(value=>({name:value,value}))))
      .addIntegerOption(o => o.setName('seconds').setDescription('Cooldown in seconds').setRequired(true).setMinValue(0).setMaxValue(604800)))
    .addSubcommand(s => s.setName('toggles').setDescription('Enable or disable a community option')
      .addStringOption(o => o.setName('setting').setDescription('Setting').setRequired(true).addChoices({name:'anonymous-feedback',value:'anonymousFeedback'},{name:'public-polls',value:'publicPolls'},{name:'discord-invites',value:'allowDiscordInvites'},{name:'public-vote-totals',value:'publicVoteTotals'},{name:'community-module',value:'enabled'}))
      .addBooleanOption(o => o.setName('enabled').setDescription('Enabled state').setRequired(true)))
    .addSubcommand(s => s.setName('roles').setDescription('Configure self-assignable editing roles')
      .addRoleOption(o => o.setName('role_1').setDescription('Editing role').setRequired(true))
      .addRoleOption(o => o.setName('role_2').setDescription('Editing role')).addRoleOption(o => o.setName('role_3').setDescription('Editing role'))
      .addRoleOption(o => o.setName('role_4').setDescription('Editing role')).addRoleOption(o => o.setName('role_5').setDescription('Editing role'))
      .addRoleOption(o => o.setName('role_6').setDescription('Editing role')).addRoleOption(o => o.setName('role_7').setDescription('Editing role'))
      .addRoleOption(o => o.setName('role_8').setDescription('Editing role'))))
  .addSubcommandGroup(g => g.setName('roles').setDescription('Role system settings')
    .addSubcommand(s=>s.setName('view').setDescription('View role settings'))
    .addSubcommand(s=>s.setName('set').setDescription('Configure an essential role').addStringOption(o=>o.setName('type').setDescription('Role type').setRequired(true).addChoices(...['verified','newMember','helper','moderator','administrator','ticketStaff','booster','botDeveloper','supplier','botUpdates','friend'].map(value=>({name:value,value})))).addRoleOption(o=>o.setName('role').setDescription('Selected role').setRequired(true)))
    .addSubcommand(s=>s.setName('category').setDescription('Configure a self-role category').addStringOption(o=>o.setName('category').setDescription('Category').setRequired(true).addChoices({name:'editing software',value:'software'},{name:'editing types',value:'editing'},{name:'notifications',value:'notifications'},{name:'languages',value:'languages'})).addStringOption(o=>o.setName('action').setDescription('Action').setRequired(true).addChoices({name:'create/update',value:'update'},{name:'add role',value:'add'},{name:'remove role',value:'remove'})).addStringOption(o=>o.setName('name').setDescription('Hebrew display name').setMaxLength(100)).addRoleOption(o=>o.setName('role').setDescription('Role for add/remove')).addIntegerOption(o=>o.setName('max_selections').setDescription('Maximum selections').setMinValue(1).setMaxValue(25)).addBooleanOption(o=>o.setName('enabled').setDescription('Category enabled')))
    .addSubcommand(s=>s.setName('permissions').setDescription('Configure role command access').addStringOption(o=>o.setName('command').setDescription('Command').setRequired(true).addChoices(...['role.add','role.remove','rolepanel.create','rolepanel.edit','rolepanel.delete','role.create','role.delete'].map(value=>({name:value,value})))).addIntegerOption(o=>o.setName('level').setDescription('2 Helper, 3 Moderator, 4 Admin, 5 Owner').setRequired(true).setMinValue(2).setMaxValue(5))))
  .addSubcommandGroup(g=>g.setName('tickets').setDescription('Ticket system settings')
    .addSubcommand(s=>s.setName('view').setDescription('View ticket settings'))
    .addSubcommand(s=>s.setName('channel').setDescription('Configure ticket channel').addStringOption(o=>o.setName('type').setDescription('Purpose').setRequired(true).addChoices({name:'panel',value:'panelChannelId'},{name:'ticket category',value:'categoryId'},{name:'archive category',value:'archiveCategoryId'},{name:'transcripts',value:'transcriptChannelId'},{name:'logs',value:'logsChannelId'})).addChannelOption(o=>o.setName('channel').setDescription('Channel/category').setRequired(true)))
    .addSubcommand(s=>s.setName('role').setDescription('Configure ticket role').addStringOption(o=>o.setName('type').setDescription('Role type').setRequired(true).addChoices({name:'ticket staff',value:'supportRoleId'},{name:'moderator',value:'moderator'},{name:'administrator',value:'administrator'})).addRoleOption(o=>o.setName('role').setDescription('Role').setRequired(true)))
    .addSubcommand(s=>s.setName('limits').setDescription('Configure ticket limits').addIntegerOption(o=>o.setName('max_open').setDescription('Maximum open tickets').setMinValue(1).setMaxValue(10)).addIntegerOption(o=>o.setName('close_delay').setDescription('Close delay seconds').setMinValue(1).setMaxValue(86400)).addIntegerOption(o=>o.setName('alert_cooldown').setDescription('Alert cooldown seconds').setMinValue(10).setMaxValue(86400)).addIntegerOption(o=>o.setName('max_users').setDescription('Maximum added users').setMinValue(1).setMaxValue(25)))
    .addSubcommand(s=>s.setName('types').setDescription('Enable or disable ticket type').addStringOption(o=>o.setName('type').setDescription('Ticket type').setRequired(true).addChoices(...['general','editing','report','partnership','bot_bug','resource','paid_work','management'].map(value=>({name:value,value})))).addBooleanOption(o=>o.setName('enabled').setDescription('Enabled').setRequired(true)))
    .addSubcommand(s=>s.setName('toggles').setDescription('Configure ticket behavior').addStringOption(o=>o.setName('setting').setDescription('Setting').setRequired(true).addChoices(...['transcriptsEnabled','creatorCanClose','creatorCanAdd','creatorCanRename','claimEnabled','priorityEnabled','archiveEnabled','dmNotifications','allowDuplicateTypes'].map(value=>({name:value,value})))).addBooleanOption(o=>o.setName('enabled').setDescription('Enabled').setRequired(true)))),
  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();
    const group = interaction.options.getSubcommandGroup(false);
    if(group==='tickets'){const config=await getConfig(client,interaction.guildId),t=config.tickets;if(sub==='view')return interaction.reply({...info('הגדרות כרטיסים',`קטגוריה: ${t.categoryId?`<#${t.categoryId}>`:'לא הוגדרה'}\nארכיון: ${t.archiveCategoryId?`<#${t.archiveCategoryId}>`:'לא הוגדר'}\nצוות: ${t.supportRoleId?`<@&${t.supportRoleId}>`:'לא הוגדר'}\nתמלולים: ${t.transcriptChannelId?`<#${t.transcriptChannelId}>`:'לא הוגדר'}\nלוגים: ${t.logsChannelId?`<#${t.logsChannelId}>`:'לא הוגדר'}\nמקסימום פתוחים: ${t.maxOpenPerUser}\nעיכוב סגירה: ${t.closeDelaySeconds}s\nהתראת צוות: ${t.staffAlertCooldownSeconds}s\nסוגים פעילים: ${t.enabledTypes.join(', ')}\nלוחות: ${(t.panels||[]).join(', ')||'אין'}`),flags:MessageFlags.Ephemeral});if(interaction.user.id!==interaction.guild.ownerId)return interaction.reply({content:'רק בעל השרת יכול לשנות הגדרות כרטיסים.',flags:MessageFlags.Ephemeral});if(sub==='channel'){const type=interaction.options.getString('type'),channel=interaction.options.getChannel('channel');await updateConfig(client,interaction.guildId,{tickets:{[type]:channel.id}});}else if(sub==='role'){const type=interaction.options.getString('type'),role=interaction.options.getRole('role');if(type==='supportRoleId')await updateConfig(client,interaction.guildId,{tickets:{supportRoleId:role.id}});else await updateConfig(client,interaction.guildId,{staffRoles:{[type]:role.id}});}else if(sub==='limits')await updateConfig(client,interaction.guildId,{tickets:{maxOpenPerUser:interaction.options.getInteger('max_open')||t.maxOpenPerUser,closeDelaySeconds:interaction.options.getInteger('close_delay')||t.closeDelaySeconds,staffAlertCooldownSeconds:interaction.options.getInteger('alert_cooldown')||t.staffAlertCooldownSeconds,maxAddedUsers:interaction.options.getInteger('max_users')||t.maxAddedUsers}});else if(sub==='types'){const type=interaction.options.getString('type'),enabled=interaction.options.getBoolean('enabled'),types=new Set(t.enabledTypes);enabled?types.add(type):types.delete(type);await updateConfig(client,interaction.guildId,{tickets:{enabledTypes:[...types]}});}else{const setting=interaction.options.getString('setting');await updateConfig(client,interaction.guildId,{tickets:{[setting]:interaction.options.getBoolean('enabled')}});}return interaction.reply({...success('הגדרות הכרטיסים עודכנו','השינוי נשמר בהצלחה.'),flags:MessageFlags.Ephemeral});}
    if (group === 'roles') {
      const config = await getConfig(client, interaction.guildId);
      if (sub === 'view') return interaction.reply({ ...info('הגדרות מערכת התפקידים', `${Object.entries(config.staffRoles).map(([name,id])=>`${name}: ${id?`<@&${id}>`:'לא הוגדר'}`).join('\n')}\n\n**קטגוריות בחירה עצמית**\n${Object.entries(config.roles.categories||{}).map(([id,c])=>`${id}: ${c.enabled===false?'כבויה':'פעילה'} • ${(c.roleIds||[]).length} תפקידים • עד ${c.maxSelections||1}`).join('\n')||'לא הוגדרו'}\n\nפאנלים: ${(config.roles.panels||[]).length}`), flags: MessageFlags.Ephemeral });
      if (interaction.user.id !== interaction.guild.ownerId) return interaction.reply({ content:'רק בעל השרת יכול לשנות את הגדרות התפקידים.', flags:MessageFlags.Ephemeral });
      if (sub === 'set') { const type=interaction.options.getString('type'),role=interaction.options.getRole('role');if(role.managed||role.position>=interaction.guild.members.me.roles.highest.position)return interaction.reply({content:'לא ניתן לשמור תפקיד מנוהל או תפקיד שמעל הבוט.',flags:MessageFlags.Ephemeral});await updateConfig(client,interaction.guildId,{staffRoles:{[type]:role.id}});return interaction.reply({...success('התפקיד נשמר',`${type}: ${role}`),flags:MessageFlags.Ephemeral}); }
      if (sub === 'permissions') { const command=interaction.options.getString('command'),level=interaction.options.getInteger('level'),minimum=command==='role.delete'?5:command.startsWith('rolepanel.')||command==='role.create'?4:3;if(level<minimum)return interaction.reply({content:`לא ניתן להגדיר את ${command} מתחת לרמת גישה ${minimum}.`,flags:MessageFlags.Ephemeral});await updateConfig(client,interaction.guildId,{commandPermissions:{[command]:level}});return interaction.reply({...success('הרשאות הפקודה עודכנו',`${command}: רמה ${level}`),flags:MessageFlags.Ephemeral}); }
      const id=interaction.options.getString('category'),action=interaction.options.getString('action'),role=interaction.options.getRole('role'),current=config.roles.categories?.[id]||{name:id,roleIds:[],maxSelections:1,enabled:true};
      if(['add','remove'].includes(action)&&!role)return interaction.reply({content:'יש לבחור תפקיד להוספה או להסרה.',flags:MessageFlags.Ephemeral});if(role&&(role.managed||role.position>=interaction.guild.members.me.roles.highest.position||Object.values(config.staffRoles).includes(role.id)))return interaction.reply({content:'לא ניתן להוסיף תפקיד מוגן, מנוהל או גבוה מהבוט.',flags:MessageFlags.Ephemeral});
      let roleIds=[...(current.roleIds||[])];if(action==='add')roleIds=[...new Set([...roleIds,role.id])];if(action==='remove')roleIds=roleIds.filter(value=>value!==role.id);const category={...current,roleIds,name:interaction.options.getString('name')||current.name,maxSelections:Math.min(interaction.options.getInteger('max_selections')||current.maxSelections||1,Math.max(1,roleIds.length)),enabled:interaction.options.getBoolean('enabled')??current.enabled};await updateConfig(client,interaction.guildId,{roles:{categories:{...config.roles.categories,[id]:category}}});return interaction.reply({...success('קטגוריית התפקידים עודכנה',`${category.name}: ${roleIds.length} תפקידים.`),flags:MessageFlags.Ephemeral});
    }
    if (group === 'community') {
      const config = await getConfig(client, interaction.guildId);
      if (sub === 'view') {
        const c = config.community, channels = config.channels;
        return interaction.reply({ ...info('הגדרות קהילה', `הצעות: ${channels.suggestions ? `<#${channels.suggestions}>` : 'לא הוגדר'}\nמשוב: ${channels.feedback ? `<#${channels.feedback}>` : 'לא הוגדר'}\nדיווחים: ${channels.reports ? `<#${channels.reports}>` : 'לא הוגדר'}\nפרסום עצמי: ${channels.selfPromotion ? `<#${channels.selfPromotion}>` : 'לא הוגדר'}\nמחפש עורך: ${channels.lookingForEditor ? `<#${channels.lookingForEditor}>` : 'לא הוגדר'}\nמחפש צוות: ${channels.lookingForTeam ? `<#${channels.lookingForTeam}>` : 'לא הוגדר'}\n\n**זמני המתנה (שניות)**\n${Object.entries(c.cooldowns).map(([name,value])=>`${name}: ${value}`).join('\n')}\n\nמשוב אנונימי: ${c.anonymousFeedback?'פעיל':'כבוי'}\nסקרים ציבוריים: ${c.publicPolls?'פעיל':'כבוי'}\nקישורי Discord: ${c.allowDiscordInvites?'פעיל':'כבוי'}\nתוצאות הצבעה ציבוריות: ${c.publicVoteTotals?'פעיל':'כבוי'}\nמודול קהילה: ${c.enabled?'פעיל':'כבוי'}\nתפקידי עריכה: ${c.editingRoleIds.length}`), flags: MessageFlags.Ephemeral });
      }
      if (interaction.user.id !== interaction.guild.ownerId) return interaction.reply({ content: 'רק בעל השרת יכול לשנות את הגדרות הקהילה.', flags: MessageFlags.Ephemeral });
      if (sub === 'channel') {
        const type = interaction.options.getString('type'), channel = interaction.options.getChannel('channel');
        await updateConfig(client, interaction.guildId, { channels: { [type]: channel.id } });
        return interaction.reply({ ...success('ערוץ הקהילה עודכן', `${type}: ${channel}`), flags: MessageFlags.Ephemeral });
      }
      if (sub === 'cooldown') {
        const command = interaction.options.getString('command'), seconds = interaction.options.getInteger('seconds');
        await updateConfig(client, interaction.guildId, { community: { cooldowns: { [command]: seconds } } });
        return interaction.reply({ ...success('זמן ההמתנה עודכן', `/${command}: ${seconds} שניות`), flags: MessageFlags.Ephemeral });
      }
      if (sub === 'toggles') {
        const setting = interaction.options.getString('setting'), enabled = interaction.options.getBoolean('enabled');
        await updateConfig(client, interaction.guildId, { community: { [setting]: enabled } });
        return interaction.reply({ ...success('הגדרת הקהילה עודכנה', `${setting}: ${enabled ? 'פעיל' : 'כבוי'}`), flags: MessageFlags.Ephemeral });
      }
      const roles = Array.from({length:8},(_,index)=>interaction.options.getRole(`role_${index+1}`)).filter(Boolean);
      const invalid = roles.some(role => role.managed || role.position >= interaction.guild.members.me.roles.highest.position || Object.values(config.staffRoles).includes(role.id));
      if (invalid) return interaction.reply({ content: 'אחד התפקידים מנוהל, מוגן או גבוה מתפקיד הבוט.', flags: MessageFlags.Ephemeral });
      await updateConfig(client, interaction.guildId, { community: { editingRoleIds: roles.map(role=>role.id) } });
      return interaction.reply({ ...success('תפקידי העריכה עודכנו', `נשמרו ${roles.length} תפקידים לבחירה עצמית.`), flags: MessageFlags.Ephemeral });
    }
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
