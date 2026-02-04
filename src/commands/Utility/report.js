import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// Migrated from: commands/Utility/report.js
export default {
    data: new SlashCommandBuilder()
        .setName("report")
        .setDescription("Report a user or an issue to the server staff.")
        .addUserOption((option) =>
            option
                .setName("user")
                .setDescription("The user you want to report.")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName("reason")
                .setDescription("The reason for the report (be detailed).")
                .setRequired(true)
                .setMaxLength(500),
        )
        .setDMPermission(false),
    category: "Utility",

    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {object} config
     * @param {import('discord.js').Client} client
     */
    async execute(interaction, config, client) {
    await InteractionHelper.safeExecute(
        interaction,
        async () => {
        // safeExecute already defers; don't defer again

        const targetUser = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason");
        const guildId = interaction.guildId;

        try {
            const guildConfig = await getGuildConfig(client, guildId);
            const reportChannelId = guildConfig.reportChannelId;

            if (!reportChannelId) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Setup Required",
                            "The report channel has not been set up. Please ask a moderator to use `/setreportchannel` first.",
                        ),
                    ],
                });
            }

            // 2. Fetch the report channel object
            const reportChannel =
                interaction.guild.channels.cache.get(reportChannelId);

            if (!reportChannel) {
                // This error handles cases where the channel ID exists, but the channel was deleted
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Channel Missing",
                            "The configured report channel is missing or inaccessible. Please ask a moderator to reset it.",
                        ),
                    ],
                });
            }

            const reportEmbed = createEmbed({ title: `🚨 NEW USER REPORT: ${targetUser.tag}`, description: `**Reported By:** ${interaction.user.tag} (\`${interaction.user.id}\`)\n**Reported User:** ${targetUser.tag} (\`${targetUser.id}\`)` })
                .setColor(0xff0000) // Red color for urgency
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { name: "Reason", value: reason },
                    {
                        name: "Reported In Channel",
                        value: interaction.channel.toString(),
                        inline: true,
                    },
                    {
                        name: "Time",
                        value: new Date().toUTCString(),
                        inline: true,
                    },
                );

            // 4. Send the report
            await reportChannel.send({
                content: `<@&${interaction.guild.ownerId}> New Report!`,
                embeds: [reportEmbed],
            });

            // 5. Confirmation reply (Ephemeral)
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    createEmbed({ title: "✅ Report Submitted", description: `Your report against **${targetUser.tag}** has been successfully filed and sent to the moderation team. Thank you!`, }),
                ],
            });
        } catch (error) {
            console.error("Report command error:", error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        "System Error",
                        "An unexpected error occurred while submitting the report.",
                    ),
                ],
            });
        }
    
        },
        { title: 'Command Error', description: 'Failed to execute command. Please try again later.' }
    );
},
};
