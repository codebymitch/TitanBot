import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { logEvent } from '../../utils/moderation.js';

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
        await interaction.deferReply({ flags: ["Ephemeral"] });

        const target = interaction.options.getUser("target");
        const guildId = interaction.guildId;

        try {
            const warningsKey = `warnings-${guildId}-${target.id}`;
            const userWarns = await client.db.get(warningsKey);
            
            // Ensure userWarns is an array, handle corrupted or invalid data
            const warningsArray = Array.isArray(userWarns) ? userWarns : [];
            const validWarnings = warningsArray.filter((w) => w && typeof w === 'object' && w.reason && w.moderatorId && w.date);
            const totalWarns = validWarnings.length;

            if (totalWarns === 0)
                return interaction.editReply({
                    embeds: [
                        createEmbed({ title: `Warnings: ${target.tag}`, description: "✅ This user has no recorded warnings.", }).setColor("#2ECC71"),
                    ],
                });

            const embed = createEmbed({ title: `Warnings: ${target.tag}`, description: `Total Warnings: **${totalWarns}**`, }).setColor("#F39C12");

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

            // Log the action for audit purposes
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

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error("Warnings Command Error:", error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Database Error",
                        "An error occurred while trying to retrieve warnings from the database.",
                    ),
                ],
            });
        }
    },
};
