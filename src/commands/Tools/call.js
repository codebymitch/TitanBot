import { ChannelType, SlashCommandBuilder } from 'discord.js';
import { isStaff } from '../../services/berryRpg.js';

export default {
  data: new SlashCommandBuilder()
    .setName('call')
    .setDescription('Set up or stop a staff-managed message relay.')
    .addStringOption(option => option.setName('action').setDescription('Relay action').setRequired(true)
      .addChoices({ name: 'Start relay', value: 'start' }, { name: 'Stop my relays', value: 'stop' }))
    .addUserOption(option => option.setName('user').setDescription('Member to ping in the destination'))
    .addChannelOption(option => option.setName('channel').setDescription('Destination channel')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addChannelOption(option => option.setName('source').setDescription('Channel whose messages get relayed (defaults to here)')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),

  async execute(interaction, config, client) {
    if (!isStaff(interaction)) return interaction.reply({ content: 'Only server administrators or members with Manage Server can set up message relays.', ephemeral: true });
    const key = 'berry:calls:' + interaction.guildId;
    const links = await client.db.get(key, []);
    const action = interaction.options.getString('action');

    if (action === 'stop') {
      const remaining = links.filter(link => link.ownerId !== interaction.user.id);
      await client.db.set(key, remaining);
      return interaction.reply({ content: 'Stopped your message relay(s).', ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const destination = interaction.options.getChannel('channel');
    const source = interaction.options.getChannel('source') || interaction.channel;
    if (!user || !destination) return interaction.reply({ content: 'Choose a member to ping and a destination channel.', ephemeral: true });
    if (user.bot) return interaction.reply({ content: 'Choose a person, not a bot.', ephemeral: true });
    if (destination.guildId !== interaction.guildId || source.guildId !== interaction.guildId) return interaction.reply({ content: 'The source and destination must be in this server.', ephemeral: true });

    const next = links.filter(link => !(link.ownerId === interaction.user.id && link.sourceChannelId === source.id));
    next.push({ ownerId: interaction.user.id, targetId: user.id, sourceChannelId: source.id, destinationChannelId: destination.id, createdAt: Date.now() });
    await client.db.set(key, next);
    return interaction.reply({ content: 'Relay started: messages you send in ' + source.toString() + ' will be copied to ' + destination.toString() + ' and ping ' + user.toString() + '. Use /call action:stop to stop it.', ephemeral: true });
  }
};
