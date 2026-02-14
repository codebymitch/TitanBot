import { ButtonInteraction, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed } from '../utils/embeds.js';
import { getGuildConfig } from '../services/guildConfig.js';

/**
 * Handle verification button clicks
 * @param {ButtonInteraction} interaction - The button interaction
 * @param {Client} client - Discord client
 */
export async function handleVerificationButton(interaction, client) {
    const guild = interaction.guild;
    const member = interaction.member;

    try {
        const guildConfig = await getGuildConfig(client, guild.id);
        
        if (!guildConfig.verification?.enabled) {
            return await interaction.reply({
                embeds: [errorEmbed("Verification Disabled", "The verification system is not enabled on this server.")],
                flags: MessageFlags.Ephemeral
            });
        }

        const verifiedRole = guild.roles.cache.get(guildConfig.verification.roleId);
        if (!verifiedRole) {
            return await interaction.reply({
                embeds: [errorEmbed("Configuration Error", "Verified role not found. Please contact an administrator.")],
                flags: MessageFlags.Ephemeral
            });
        }

        if (member.roles.cache.has(verifiedRole.id)) {
            return await interaction.reply({
                embeds: [infoEmbed("Already Verified", "You are already verified and have access to the server.")],
                flags: MessageFlags.Ephemeral
            });
        }

        if (!guild.members.me.permissions.has("ManageRoles")) {
            return await interaction.reply({
                embeds: [errorEmbed("Bot Permission Error", "I don't have permission to manage roles. Please contact an administrator.")],
                flags: MessageFlags.Ephemeral
            });
        }

        const botRole = guild.members.me.roles.highest;
        if (verifiedRole.position >= botRole.position) {
            return await interaction.reply({
                embeds: [errorEmbed("Role Hierarchy Error", "The verified role is higher than or equal to my highest role. Please contact an administrator.")],
                flags: MessageFlags.Ephemeral
            });
        }

        await member.roles.add(verifiedRole.id, "User verified themselves");
        
        await interaction.reply({
            embeds: [successEmbed(
                "✅ Verification Successful!",
                `You have been verified and given the **${verifiedRole.name}** role! Welcome to the server! 🎉\n\nYou now have access to all server channels and features.`
            )],
            flags: MessageFlags.Ephemeral
        });

        console.log(`✅ ${member.user.tag} (${member.id}) verified themselves in ${guild.name}`);

    } catch (error) {
        console.error("Verification button handler error:", error);
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
                embeds: [errorEmbed("Verification Failed", "Failed to assign verified role. Please contact an administrator.")],
                flags: MessageFlags.Ephemeral
            });
        } else {
            await interaction.reply({
                embeds: [errorEmbed("Verification Failed", "Failed to assign verified role. Please contact an administrator.")],
                flags: MessageFlags.Ephemeral
            });
        }
    }
}

export default {
    customId: "verify_user",
    execute: handleVerificationButton
};
