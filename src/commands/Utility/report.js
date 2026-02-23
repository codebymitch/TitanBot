import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
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

    




    async execute(interaction, config, client) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction);
            if (!deferSuccess) {
                logger.warn(`Report interaction defer failed`, {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'report'
                });
                return;
            }

            const targetUser = interaction.options.getUser("user");
            const reason = interaction.options.getString("reason");
            const guildId = interaction.guildId;

            const guildConfig = await getGuildConfig(client, guildId);
            const reportChannelId = guildConfig.reportChannelId;

            if (!reportChannelId) {
                logger.warn(`Report command - report channel not configured`, {
                    userId: interaction.user.id,
                    guildId: guildId,
                    commandName: 'report'
                });
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Setup Required",
                            "The report channel has not been set up. Please ask a moderator to use `/setreportchannel` first.",
                        ),
                    ],
                });
            }

            const reportChannel = interaction.guild.channels.cache.get(reportChannelId);

            if (!reportChannel) {
                logger.warn(`Report command - report channel missing`, {
                    userId: interaction.user.id,
                    guildId: guildId,
                    reportChannelId: reportChannelId,
                    commandName: 'report'
                });
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Channel Missing",
                            "The configured report channel is missing or inaccessible. Please ask a moderator to reset it.",
                        ),
                    ],
                });
            }

            const reportEmbed = createEmbed({ 
                title: `🚨 NEW USER REPORT: ${targetUser.tag}`, 
                description: `**Reported By:** ${interaction.user.tag} (\`${interaction.user.id}\`)\n**Reported User:** ${targetUser.tag} (\`${targetUser.id}\`)` 
            })
            .setColor(getColor('error'))
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

            await reportChannel.send({
                content: `<@&${interaction.guild.ownerId}> New Report!`,
                embeds: [reportEmbed],
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    createEmbed({ title: "✅ Report Submitted", description: `Your report against **${targetUser.tag}** has been successfully filed and sent to the moderation team. Thank you!`, }),
                ],
            });

            logger.info(`Report command executed - user report submitted`, {
                userId: interaction.user.id,
                reportedUserId: targetUser.id,
                guildId: guildId,
                reasonLength: reason.length
            });
        } catch (error) {
            logger.error(`Report command execution failed`, {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'report'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'report',
                source: 'report_command'
            });
        }
    },
};




