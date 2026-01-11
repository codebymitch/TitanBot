import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Config/setpremiumrole.js
export default {
    data: new SlashCommandBuilder()
        .setName("setpremiumrole")
        .setDescription(
            "Sets the Discord role granted when the Premium Role shop item is purchased.",
        )
        .addRoleOption((option) =>
            option
                .setName("role")
                .setDescription(
                    "The role to be designated as the Premium Shop Role.",
                )
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),
    category: "config",

    async execute(interaction, config, client) {
        await interaction.deferReply({ ephemeral: true });

        // Permission check (redundant due to setDefaultMemberPermissions, but good practice)
        if (
            !interaction.member.permissions.has(
                PermissionsBitField.Flags.ManageGuild,
            )
        ) {
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
    },
};
