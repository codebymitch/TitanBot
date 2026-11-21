import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} from 'discord.js';

const COLOR = 0x39ff88;
const getKey = (guildId) => `guild:${guildId}:boosts`;

const DEFAULT_CONFIG = {
  enabled: false,
  channelId: null,
  roleId: null,
  message: null,
};

async function getConfig(client, guildId) {
  return {
    ...DEFAULT_CONFIG,
    ...(await client.db.get(getKey(guildId), {})),
  };
}

export default {
  data: new SlashCommandBuilder()
    .setName('boosts')
    .setDescription('Configure server booster announcements and rewards')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(sub =>
      sub
        .setName('setup')
        .setDescription('Set up the server boost system')
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Channel for boost announcements')
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
            )
            .setRequired(true),
        )
        .addRoleOption(option =>
          option
            .setName('role')
            .setDescription('Optional automatic booster role')
            .setRequired(false),
        )
        .addStringOption(option =>
          option
            .setName('message')
            .setDescription('Custom message: {user}, {server}, {boosts}')
            .setMaxLength(1000)
            .setRequired(false),
        ),
    )

    .addSubcommand(sub =>
      sub
        .setName('config')
        .setDescription('View the current boost configuration'),
    )

    .addSubcommand(sub =>
      sub
        .setName('test')
        .setDescription('Send a test boost announcement'),
    )

    .addSubcommand(sub =>
      sub
        .setName('disable')
        .setDescription('Disable boost announcements and automatic roles'),
    )

    .addSubcommand(sub =>
      sub
        .setName('rewards')
        .setDescription('Configure the automatic booster role')
        .addRoleOption(option =>
          option
            .setName('role')
            .setDescription('Booster role; omit to remove the configured role')
            .setRequired(false),
        ),
    ),

  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: 'This command can only be used inside a server.',
        ephemeral: true,
      });
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        content: 'You need the **Manage Server** permission.',
        ephemeral: true,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const config = await getConfig(client, guildId);

    // SETUP
    if (subcommand === 'setup') {
      const channel = interaction.options.getChannel('channel', true);
      const role = interaction.options.getRole('role');
      const message = interaction.options.getString('message');

      if (!channel.isTextBased() || !channel.send) {
        return interaction.reply({
          content: 'Please select a valid text channel.',
          ephemeral: true,
        });
      }

      config.enabled = true;
      config.channelId = channel.id;

      if (role) config.roleId = role.id;
      if (message !== null) config.message = message;

      await client.db.set(getKey(guildId), config);

      return interaction.reply({
        content:
          `**Boost system enabled!**\n` +
          `Announcement channel: ${channel}\n` +
          `Booster role: ${config.roleId ? `<@&${config.roleId}>` : 'Not configured'}\n` +
          `Custom message: ${config.message ? 'Configured' : 'Default message'}`,
        ephemeral: true,
      });
    }

    // CONFIG
    if (subcommand === 'config') {
      const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setTitle('💚 Zee • Boost Configuration')
        .setDescription(
          config.enabled
            ? '<:online:1> **System Enabled**'
            : '**System Disabled**',
        )
        .addFields(
          {
            name: 'Announcement Channel',
            value: config.channelId
              ? `<#${config.channelId}>`
              : 'Not configured',
            inline: true,
          },
          {
            name: 'Booster Role',
            value: config.roleId
              ? `<@&${config.roleId}>`
              : 'Not configured',
            inline: true,
          },
          {
            name: 'Custom Message',
            value: config.message || 'Default message',
          },
        )
        .setFooter({ text: 'Zee • Server Management' })
        .setTimestamp();

      return interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    }

    // DISABLE
    if (subcommand === 'disable') {
      config.enabled = false;

      await client.db.set(getKey(guildId), config);

      return interaction.reply({
        content: 'Boost announcements have been disabled.',
        ephemeral: true,
      });
    }

    // REWARDS
    if (subcommand === 'rewards') {
      const role = interaction.options.getRole('role');

      if (role && role.managed) {
        return interaction.reply({
          content: 'That role is managed by an integration and cannot be assigned manually.',
          ephemeral: true,
        });
      }

      config.roleId = role?.id ?? null;

      await client.db.set(getKey(guildId), config);

      return interaction.reply({
        content: role
          ? `Automatic booster role set to ${role}.`
          : 'Automatic booster role has been removed.',
        ephemeral: true,
      });
    }

    // TEST
    if (subcommand === 'test') {
      if (!config.enabled || !config.channelId) {
        return interaction.reply({
          content: 'Run `/boosts setup` first.',
          ephemeral: true,
        });
      }

      const channel = await interaction.guild.channels
        .fetch(config.channelId)
        .catch(() => null);

      if (!channel?.isTextBased() || !channel.send) {
        return interaction.reply({
          content: 'The configured channel is unavailable. Please run setup again.',
          ephemeral: true,
        });
      }

      const previewMessage = (
        config.message ||
        'Thank you {user} for boosting **{server}**! 💚'
      )
        .replaceAll('{user}', interaction.user.toString())
        .replaceAll('{server}', interaction.guild.name)
        .replaceAll(
          '{boosts}',
          String(interaction.guild.premiumSubscriptionCount ?? 0),
        );

      const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setTitle('💚 New Server Booster!')
        .setDescription(previewMessage)
        .addFields({
          name: 'Total Server Boosts',
          value: String(interaction.guild.premiumSubscriptionCount ?? 0),
          inline: true,
        })
        .setThumbnail(interaction.user.displayAvatarURL())
        .setFooter({ text: 'Zee • Server Boosts' })
        .setTimestamp();

      await channel.send({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });

      return interaction.reply({
        content: `Test announcement sent to ${channel}.`,
        ephemeral: true,
      });
    }
  },
};
