import { PermissionsBitField, MessageFlags } from 'discord.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { successEmbed, warningEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            const embed = warningEmbed('Access Denied', 'You need the **Manage Server** permission to change the streak settings.');
            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        }

        try {
            const guildId = interaction.guildId;
            const guildConfig = await getGuildConfig(client, guildId);
            const streak = guildConfig.streak && typeof guildConfig.streak === 'object'
                ? { ...guildConfig.streak }
                : {};

            const nextEnabled = streak.enabled !== true;
            streak.enabled = nextEnabled;
            guildConfig.streak = streak;
            await setGuildConfig(client, guildId, guildConfig);

            const embed = nextEnabled
                ? successEmbed('Streak Enabled', 'The streak system is now **active** on this server. Make sure the streak channel is set via `/streak channel` so notifications can be sent.')
                : warningEmbed('Streak Disabled', 'The streak system is now **inactive** on this server. Streaks won\'t be tracked and notifications won\'t be sent.');

            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('streak_toggle error:', error);
            const embed = warningEmbed('Failed to Save', 'Couldn\'t save the streak settings. Try again later.');
            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
