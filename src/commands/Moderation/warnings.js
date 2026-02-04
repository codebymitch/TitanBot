import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { logEvent } from '../../utils/moderation.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// Migrated from: commands/Moderation/warnings.js
export default {
    data: new SlashCommandBuilder()
        .setName("warnings")
        .setDescription("View all warnings for a user")
        .addUserOption((o) =>
            o
                .setName("target")
                .setRequired(true)
                .setDescription("User to check warnings for"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        try {
            await InteractionHelper.safeExecute(
                interaction,
                async () => {
                const target = interaction.options.getUser("target");
                const guildId = interaction.guildId;

                // Get warnings from database
                const warningsKey = `warnings-${guildId}-${target.id}`;
                const userWarns = await client.db.get(warningsKey);
                const warningsArray = Array.isArray(userWarns) ? userWarns : [];
                const validWarnings = warningsArray.filter((w) => w && typeof w === 'object' && w.reason && w.moderatorId && w.date);
                const totalWarns = validWarnings.length;

                // If no warnings, send info message
                if (totalWarns === 0) {
                    await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            createEmbed({ 
                                title: `Warnings: ${target.tag}`, 
                                description: "✅ This user has no recorded warnings." 
                            }).setColor("#2ECC71"),
                        ],
                    });
                    return;
                }

                // Build warnings embed
                const embed = createEmbed({ 
                    title: `Warnings: ${target.tag}`, 
                    description: `Total Warnings: **${totalWarns}**` 
                }).setColor("#F39C12");

                const warningFields = validWarnings
                    .map((w, i) => {
                        const discordTimestamp = Math.floor(w.date / 1000);
                        return {
                            name: `[#${i + 1}] Reason: ${w.reason.substring(0, 100)}`,
                            value: `**Moderator:** <@${w.moderatorId}>\n**Date:** <t:${discordTimestamp}:F> (<t:${discordTimestamp}:R>)`,
                            inline: false,
                        };
                    })
                    .slice(0, 25);

                embed.addFields(warningFields);

                // Log the action
                await logEvent({
                    client,
                    guild: interaction.guild,
                    event: {
                        action: "Warnings Viewed",
                        target: `${target.tag} (${target.id})`,
                        executor: `${interaction.user.tag} (${interaction.user.id})`,
                        reason: `Viewed ${totalWarns} warnings`,
                        metadata: {
                            userId: target.id,
                            moderatorId: interaction.user.id,
                            totalWarnings: totalWarns,
                            validWarnings: validWarnings.length
                        }
                    }
                });

                // Send the warnings embed
                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
                },
                errorEmbed("Warnings Error", "Could not retrieve warnings. Database error occurred.")
            );
        } catch (error) {
            console.error('Warnings command error:', error);
            return interaction.reply({
                embeds: [errorEmbed('System Error', 'Could not retrieve warnings at this time.')],
                ephemeral: true,
            });
        }
    },
};
