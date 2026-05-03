import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Set the slowmode delay for a text channel')
        .addIntegerOption(option =>
            option
                .setName('seconds')
                .setDescription('Delay in seconds (0 to disable, max 21600)')
                .setMinValue(0)
                .setMaxValue(21600)
                .setRequired(true)
        )
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('Channel to apply slowmode to (defaults to current channel)')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction) {
        try {
            const seconds = interaction.options.getInteger('seconds');
            const channel = interaction.options.getChannel('channel') || interaction.channel;

            if (!channel.isTextBased() || channel.isDMBased()) {
                return InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed('Invalid Channel', 'Slowmode can only be applied to text channels.')],
                    flags: [MessageFlags.Ephemeral],
                });
            }

            await channel.setRateLimitPerUser(seconds, `Set by ${interaction.user.username} via /slowmode`);

            const description = seconds === 0
                ? `Slowmode has been **disabled** in ${channel}.`
                : `Slowmode set to **${seconds}s** in ${channel}. Users must wait ${seconds}s between messages.`;

            await InteractionHelper.safeReply(interaction, {
                embeds: [successEmbed('Slowmode Updated', description)],
                ephemeral: true,
            });

            logger.info(`Slowmode set to ${seconds}s in channel ${channel.id} by ${interaction.user.id}`);
        } catch (error) {
            logger.error('Slowmode command error:', error);
            await handleInteractionError(interaction, error, { commandName: 'slowmode' });
        }
    },
};
