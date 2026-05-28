import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { BotConfig } from '../../config/bot.js';
import { getGuildConfig, setGuildConfig } from '../../services/guildConfig.js';

export default {
    data: new SlashCommandBuilder()
        .setName("prefix")
        .setDescription("View or change the bot prefix for this server")
        .addStringOption((option) =>
            option
                .setName("newprefix")
                .setDescription("The new prefix for this server (leave empty to view current)")
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    category: "utility",

    async execute(interaction, config, client) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction);
            if (!deferSuccess) {
                logger.warn(`Prefix interaction defer failed`, {
                    userId: interaction.user.id,
                    guildId: interaction.guildId
                });
                return;
            }

            const newPrefix = interaction.options.getString("newprefix");
            const guildId = interaction.guildId;

            // If no new prefix provided, show current prefix
            if (!newPrefix) {
                const guildConfig = await getGuildConfig(client, guildId);
                const currentPrefix = guildConfig.prefix || BotConfig.prefix || 'nh!';

                const embed = createEmbed({
                    title: "Server Prefix",
                    description: `The prefix for this server is: \`${currentPrefix}\`\n\nExample: \`${currentPrefix}help\``,
                    color: "blurple",
                });

                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

                logger.info(`User checked prefix`, {
                    userId: interaction.user.id,
                    guildId,
                    currentPrefix
                });
                return;
            }

            // Validate new prefix
            if (newPrefix.length > 5) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Invalid Prefix', 'Prefix must be 5 characters or less.')]
                });
            }

            if (newPrefix.length === 0) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Invalid Prefix', 'Prefix cannot be empty.')]
                });
            }

            // Set new prefix
            const guildConfig = await getGuildConfig(client, guildId);
            const oldPrefix = guildConfig.prefix || BotConfig.prefix || 'nh!';
            
            await setGuildConfig(client, guildId, {
                ...guildConfig,
                prefix: newPrefix
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        '✅ Prefix Updated',
                        `Server prefix has been changed to: \`${newPrefix}\`\n\nExample: \`${newPrefix}help\``
                    )
                ]
            });

            logger.info(`Server prefix updated`, {
                userId: interaction.user.id,
                guildId,
                oldPrefix,
                newPrefix
            });
        } catch (error) {
            logger.error("Prefix command error:", error);
            await handleInteractionError(interaction, error, { subtype: "prefix_failed" });
        }
    }
};
