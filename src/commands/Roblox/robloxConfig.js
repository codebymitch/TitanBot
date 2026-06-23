import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

export default {
  data: new SlashCommandBuilder()
    .setName('robloxconfig')
    .setDescription('Configure Roblox join request notification channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('setchannel')
        .setDescription('Set the Discord channel for Roblox join request notifications')
        .addStringOption(option =>
          option
            .setName('department')
            .setDescription('Which department to configure')
            .setRequired(true)
            .addChoices(
              { name: 'Test Group', value: 'TEST' },
              { name: 'LASD', value: 'LASD' },
              { name: 'CHP', value: 'CHP' },
              { name: 'LAFD', value: 'LAFD' }
            )
        )
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('The Discord channel to send notifications to')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('View current Roblox configuration')
    ),

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'setchannel') {
        const department = interaction.options.getString('department');
        const channel = interaction.options.getChannel('channel');

        const envVarMap = {
          TEST: 'ROBLOX_REQUESTS_CHANNEL_TEST',
          LASD: 'ROBLOX_REQUESTS_CHANNEL_LASD',
          CHP: 'ROBLOX_REQUESTS_CHANNEL_CHP',
          LAFD: 'ROBLOX_REQUESTS_CHANNEL_LAFD'
        };

        const envVar = envVarMap[department];

        // Note: In a real implementation, you'd save this to a database
        // For now, we'll just show the user what they need to set
        await interaction.reply({
          content: `✅ To configure the ${department} join request channel, set the following environment variable in Railway:\n\n\`\`\`\n${envVar}=${channel.id}\n\`\`\`\n\nChannel: ${channel.toString()}`,
          ephemeral: true
        });

        logger.info(`User ${interaction.user.tag} configured ${department} channel to ${channel.id}`);
      } else if (subcommand === 'status') {
        const configs = [
          { name: 'Test Group', envVar: 'ROBLOX_REQUESTS_CHANNEL_TEST' },
          { name: 'LASD', envVar: 'ROBLOX_REQUESTS_CHANNEL_LASD' },
          { name: 'CHP', envVar: 'ROBLOX_REQUESTS_CHANNEL_CHP' },
          { name: 'LAFD', envVar: 'ROBLOX_REQUESTS_CHANNEL_LAFD' }
        ];

        const statusLines = configs.map(config => {
          const channelId = process.env[config.envVar];
          const status = channelId ? `✅ <#${channelId}>` : '❌ Not configured';
          return `**${config.name}**: ${status}`;
        });

        await interaction.reply({
          embeds: [{
            title: '🎮 Roblox Configuration Status',
            description: statusLines.join('\n'),
            color: 0x1a1a1a,
            footer: { text: 'Use /robloxconfig setchannel to configure channels' }
          }],
          ephemeral: true
        });
      }
    } catch (error) {
      logger.error('Error in robloxconfig command:', error);
      await handleInteractionError(interaction, error);
    }
  }
};

