import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

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
        await interaction.deferReply({ ephemeral: true });

        const target = interaction.options.getUser("target");
        const guildId = interaction.guildId;

        try {
            const warningsKey = `warnings-${guildId}-${target.id}`;
            const userWarns = (await client.db.get(warningsKey)) || [];
            const totalWarns = userWarns.length;

            if (totalWarns === 0)
                return interaction.editReply({
                    embeds: [
                        createEmbed(
                            `Warnings: ${target.tag}`,
                            "✅ This user has no recorded warnings.",
                        ).setColor("#2ECC71"),
                    ],
                });

            const embed = createEmbed(
                `Warnings: ${target.tag}`,
                `Total Warnings: **${totalWarns}**`,
            ).setColor("#F39C12");

            const warningFields = userWarns
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
