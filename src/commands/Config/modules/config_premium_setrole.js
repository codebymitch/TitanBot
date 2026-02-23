import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/guildConfig.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    errorEmbed(
                        "Permission Denied",
                        "You need Manage Server permissions to set the premium role.",
                    ),
                ],
            });
        }

        const role = interaction.options.getRole("role");
        const guildId = interaction.guildId;

        try {
            const currentConfig = await getGuildConfig(client, guildId);

            currentConfig.premiumRoleId = role.id;

            await setGuildConfig(client, guildId, currentConfig);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        "✅ Configuration Saved",
                        `The **Premium Shop Role** has been successfully set to ${role.toString()}.`,
                    ),
                ],
            });
        } catch (error) {
            console.error("SetPremiumRole command error:", error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        "System Error",
                        "Could not save the guild configuration.",
                    ),
                ],
            });
        }
    }
};



