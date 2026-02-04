import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/guildConfig.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: ["Ephemeral"] });
        if (!deferSuccess) return;

        // Permission check (redundant due to setDefaultMemberPermissions, but good practice)
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.editReply({
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

            // Save the new premium role ID
            currentConfig.premiumRoleId = role.id;

            await setGuildConfig(client, guildId, currentConfig);

            await interaction.editReply({
                embeds: [
                    successEmbed(
                        "✅ Configuration Saved",
                        `The **Premium Shop Role** has been successfully set to ${role.toString()}.`,
                    ),
                ],
            });
        } catch (error) {
            console.error("SetPremiumRole command error:", error);
            await interaction.editReply({
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
