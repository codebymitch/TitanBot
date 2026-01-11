import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Moderation/warn.js
export default {
    data: new SlashCommandBuilder()
        .setName("warn")
        .setDescription("Warn a user")
        .addUserOption((o) =>
            o
                .setName("target")
                .setRequired(true)
                .setDescription("User to warn"),
        )
        .addStringOption((o) =>
            o
                .setName("reason")
                .setRequired(true)
                .setDescription("Reason for the warning"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        await interaction.deferReply({ ephemeral: true });

        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.ModerateMembers,
            )
        )
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Permission Denied",
                        "You need the `Moderate Members` permission to issue warnings.",
                    ),
                ],
            });

        const target = interaction.options.getUser("target");
        const member = interaction.options.getMember("target");
        const reason = interaction.options.getString("reason");
        const moderator = interaction.user;
        const guildId = interaction.guildId;

        if (!member) {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Target Not Found",
                        "The target user is not currently in this server.",
                    ),
                ],
            });
        }

        try {
            const warningsKey = `warnings-${guildId}-${target.id}`;
            let userWarns = (await client.db.get(warningsKey)) || [];

            const newWarning = {
                reason: reason,
                moderatorId: moderator.id,
                date: Date.now(),
            };
            userWarns.push(newWarning);

            await client.db.set(warningsKey, userWarns);

            const totalWarns = userWarns.length;

            const warnEmbed = createEmbed(
                "⚠️ User Warned (Action Log)",
                `${target.tag} received a warning from ${moderator}.`,
            )
                .setColor("#FEE75C")
                .addFields(
                    {
                        name: "Target User",
                        value: `${target.tag} (${target.id})`,
                        inline: false,
                    },
                    {
                        name: "Moderator",
                        value: `${moderator.tag} (${moderator.id})`,
                        inline: true,
                    },
                    {
                        name: "Total Warns",
                        value: `${totalWarns}`,
                        inline: true,
                    },
                    { name: "Reason", value: reason, inline: false },
                );

            logEvent(client, interaction.guildId, warnEmbed, config);

            await interaction.editReply({
                embeds: [
                    successEmbed(
                        `⚠️ **Warned** ${target.tag}`,
                        `**Reason:** ${reason}\n**Total Warns:** ${totalWarns}`,
                    ),
                ],
            });
        } catch (error) {
            console.error("Warn Command Error:", error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Database Error",
                        "An error occurred while trying to save the warning to the database.",
                    ),
                ],
            });
        }
    },
};
