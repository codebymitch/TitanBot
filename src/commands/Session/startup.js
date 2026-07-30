import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';

/**
 * /startup required_reactions: int
 * Checks staff role from guild config, enforces allowed channels from guild config,
 * posts the startup embed, pings everyone and stores session state/pending sessions on the client.
 */
export default {
  slashOnly: true,
  data: new SlashCommandBuilder()
    .setName('startup')
    .setDescription('Start a roleplay session')
    .addIntegerOption((opt) =>
      opt
        .setName('required_reactions')
        .setDescription('Number of reactions needed to start the session')
        .setRequired(true)
        .setMinValue(1),
    ),

  category: 'Session',

  async execute(interaction, guildConfig = {}, client) {
    const required = interaction.options.getInteger('required_reactions');

    // Resolve staff role ID from guild config: config.roles.staff_team
    const staffRoleId = String(guildConfig?.roles?.staff_team || '');
    const memberRoles = interaction.member?.roles?.cache;

    if (!staffRoleId || !(memberRoles && memberRoles.has && memberRoles.has(staffRoleId))) {
      await interaction.reply({ content: 'Only staff team members can use this command.', ephemeral: true });
      return;
    }

    // Enforce allowed channels from guild config: channels.session_commands_channel_id / _2
    const channels = guildConfig?.channels || {};
    const allowed1 = String(channels.session_commands_channel_id || '');
    const allowed2 = String(channels.session_commands_channel_id_2 || '');

    if (![String(interaction.channelId), String(allowed1), String(allowed2)].includes(String(interaction.channelId))) {
      await interaction.reply({
        content: `This command can only be used in <#${allowed1}> or <#${allowed2}>.`,
        ephemeral: true,
      });
      return;
    }

    // Build embed from guild embed config (keys: embeds.startup)
    const ecfg = (guildConfig?.embeds && guildConfig.embeds.startup) || {};
    const title = ecfg.title || '_Greenville Roleplay Legacy_ - ___Session Startup___';
    // replace placeholders {user} and {required} if present
    let description = ecfg.description || '';
    description = description.replace(/\{user\}/g, interaction.user?.toString() || '')
                             .replace(/\{required\}/g, String(required));
    const embed = createEmbed({
      title,
      description,
      color: 'success',
    });
    if (ecfg.image_url) embed.setImage(ecfg.image_url);
    embed.setFooter({ text: guildConfig?.bot?.footer_text || '', iconURL: guildConfig?.bot?.footer_icon || '' });

    // Reply to invoker, then post the announcement (ping everyone)
    await interaction.reply({ content: 'Startup initiated.', ephemeral: true });

    const channel = interaction.channel;
    const announcement = await channel.send({
      content: '@everyone',
      embeds: [embed],
      allowedMentions: { parse: ['everyone'] },
    });

    // Add reaction (custom emoji string works: <:name:id>)
    const targetEmoji = '<:pinkcheckmark:1502780778449342494>'; // same emoji used in your python
    try {
      await announcement.react(targetEmoji);
    } catch (err) {
      // Reaction might fail if emoji not available; ignore silently
      // If you have a logger, you can log this error
    }

    // Ensure client-side stores exist
    if (!client.sessionStates) client.sessionStates = new Map();
    if (!client.pendingSessions) client.pendingSessions = new Map();

    // Save session state and pending session entry
    client.sessionStates.set(String(channel.id), {
      messageId: announcement.id,
      time: Math.floor(Date.now() / 1000),
      completed: true,
      reactors: new Set(),
    });

    client.pendingSessions.set(String(announcement.id), {
      type: 'startup',
      required,
      user: interaction.user?.toString() || interaction.user?.tag || 'unknown',
    });
  },
};
