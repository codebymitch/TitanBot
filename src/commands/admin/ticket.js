import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { updateConfig } from '../../modules/community/store.js';
import { ticketPanel, success } from '../../modules/community/ui.js';
import ticketOpen from '../../modules/interactions/buttons/ticket_open.js';
import { requireAccess, AccessLevel } from '../../modules/community/permissions.js';

export default {
  data: new SlashCommandBuilder().setName('ticket').setDescription('Open or configure tickets').setDMPermission(false)
    .addSubcommand(s => s.setName('open').setDescription('Open a support ticket'))
    .addSubcommand(s => s.setName('setup').setDescription('Create the ticket panel')
      .addChannelOption(o => o.setName('channel').setDescription('Panel channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addChannelOption(o => o.setName('category').setDescription('Ticket category').addChannelTypes(ChannelType.GuildCategory).setRequired(true))
      .addRoleOption(o => o.setName('support_role').setDescription('Support role').setRequired(true)))
    .addSubcommand(s => s.setName('disable').setDescription('Disable tickets')),
  async execute(i, client) {
    const sub = i.options.getSubcommand();
    if (!await requireAccess(i, client, sub === 'open' ? AccessLevel.VERIFIED : AccessLevel.ADMIN, `ticket.${sub}`)) return;
    if (sub === 'open') return ticketOpen.execute(i, client);
    if (sub === 'disable') { await updateConfig(client, i.guildId, { tickets: { enabled: false } }); return i.reply(success('פניות', 'מערכת הפניות כובתה.')); }
    const channel = i.options.getChannel('channel'), category = i.options.getChannel('category'), role = i.options.getRole('support_role');
    await updateConfig(client, i.guildId, { tickets: { enabled: true, panelChannelId: channel.id, categoryId: category.id, supportRoleId: role.id } });
    await channel.send(ticketPanel()); await i.reply(success('פניות', 'לוח הפניות נשלח והמערכת הופעלה.'));
  }
};
