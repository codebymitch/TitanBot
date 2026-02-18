import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { WarningService } from '../../services/warningService.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
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
            const target = interaction.options.getUser("target");
            const guildId = interaction.guildId;

            
            const validWarnings = await WarningService.getWarnings(guildId, target.id);
            const totalWarns = validWarnings.length;

            if (totalWarns === 0) {
                await interaction.editReply({
                    embeds: [
                        createEmbed({ 
                            title: `Warnings: ${target.tag}`, 
                            description: "✅ This user has no recorded warnings." 
                        }).setColor(getColor('success')),
                    ],
                });
                return;
            }

            const embed = createEmbed({ 
                title: `Warnings: ${target.tag}`, 
                description: `Total Warnings: **${totalWarns}**` 
            }).setColor(getColor('warning'));

            const warningFields = validWarnings
                .map((w, i) => {
                    const discordTimestamp = Math.floor(w.timestamp / 1000);
                    return {
                        name: `[#${i + 1}] Reason: ${w.reason.substring(0, 100)}`,
                        value: `**Moderator:** <@${w.moderatorId}>\n**Date:** <t:${discordTimestamp}:F> (<t:${discordTimestamp}:R>)`,
                        inline: false,
                    };
                })
                .slice(0, 25);

            embed.addFields(warningFields);

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
                        totalWarnings: totalWarns
                    }
                }
            });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error('Warnings command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'warnings_view_failed' });
        }
    }
};



