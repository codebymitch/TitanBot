import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { setAFKStatus, removeAFKStatus, getAFKStatus } from '../../utils/afk.js';

export default {
    data: new SlashCommandBuilder()
        .setName("afk")
        .setDescription("Set yourself as AFK (Away From Keyboard)")
        .addStringOption(option =>
            option
                .setName("reason")
                .setDescription("The reason for being AFK")
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option
                .setName("remove")
                .setDescription("Remove your AFK status")
                .setRequired(false)
        ),
    category: "utility",

    async execute(interaction, config, client) {
        await interaction.deferReply({ flags: ['Ephemeral'] });

        const reason = interaction.options.getString("reason") || "AFK";
        const remove = interaction.options.getBoolean("remove") || false;
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        try {
            // Check if user is already AFK
            const currentAFK = await getAFKStatus(client, guildId, userId);

            if (remove) {
                // Remove AFK status
                if (!currentAFK) {
                    return interaction.editReply({
                        embeds: [errorEmbed("You are not currently AFK!")]
                    });
                }

                const success = await removeAFKStatus(client, guildId, userId);
                if (success) {
                    // Update nickname if it has AFK prefix
                    const member = await interaction.guild.members.fetch(userId).catch(() => null);
                    if (member && member.nickname && member.nickname.startsWith('[AFK] ')) {
                        const originalNickname = member.nickname.replace('[AFK] ', '');
                        await member.setNickname(originalNickname).catch(() => {});
                    }

                    await interaction.editReply({
                        embeds: [successEmbed("✅ Welcome back! Your AFK status has been removed.")]
                    });
                } else {
                    await interaction.editReply({
                        embeds: [errorEmbed("Failed to remove AFK status. Please try again.")]
                    });
                }
            } else {
                // Set AFK status
                if (currentAFK) {
                    return interaction.editReply({
                        embeds: [errorEmbed("You are already AFK! Use `/afk remove:true` to disable it.")]
                    });
                }

                const success = await setAFKStatus(client, guildId, userId, reason);
                if (success) {
                    // Add AFK prefix to nickname
                    const member = await interaction.guild.members.fetch(userId).catch(() => null);
                    if (member && !member.nickname?.startsWith('[AFK] ')) {
                        const displayName = member.nickname || member.user.username;
                        const afkNickname = `[AFK] ${displayName}`;
                        await member.setNickname(afkNickname).catch(() => {});
                    }

                    await interaction.editReply({
                        embeds: [successEmbed(
                            "✅ AFK Status Set!",
                            `You are now AFK: **${reason}**\n\nPeople who mention you will see this reason.`
                        )]
                    });
                } else {
                    await interaction.editReply({
                        embeds: [errorEmbed("Failed to set AFK status. Please try again.")]
                    });
                }
            }
        } catch (error) {
            console.error("AFK command error:", error);
            await interaction.editReply({
                embeds: [errorEmbed("An error occurred while processing your AFK status.")]
            });
        }
    }
};
