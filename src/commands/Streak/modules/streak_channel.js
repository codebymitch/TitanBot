import { PermissionsBitField, MessageFlags } from 'discord.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { successEmbed, warningEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            const embed = warningEmbed('Access Denied', 'You need the **Manage Server** permission to change the streak channel.');
            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        }

        try {
            const guildId = interaction.guildId;
            const channel = interaction.options.getChannel('channel');
            const guildConfig = await getGuildConfig(client, guildId);
            const streak = guildConfig.streak && typeof guildConfig.streak === 'object'
                ? { ...guildConfig.streak }
                : {};

            streak.channelId = channel ? channel.id : null;
            guildConfig.streak = streak;
            await setGuildConfig(client, guildId, guildConfig);

            const embed = channel
                ? successEmbed('Streak Channel Set', `Streak notifications will now be sent to ${channel}.`)
                : warningEmbed('Streak Channel Removed', 'The streak channel has been removed. Notifications won\'t be sent until a new channel is set.');

            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('streak_channel error:', error);
            const embed = warningEmbed('Failed to Save', 'Couldn\'t save the streak channel. Try again later.');
            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
