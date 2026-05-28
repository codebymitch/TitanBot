import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { BotConfig } from '../../config/bot.js';

export default {
    data: new SlashCommandBuilder()
        .setName("prefix")
        .setDescription("Get the bot prefix for this server"),
    category: "utility",

    async execute(interaction) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction);
            if (!deferSuccess) {
                logger.warn(`Prefix interaction defer failed`, {
                    userId: interaction.user.id,
                    guildId: interaction.guildId
                });
                return;
            }

            const prefix = BotConfig.prefix || 'nh!';

            const embed = createEmbed({
                title: "Server Prefix",
                description: `The prefix for this server is: \`${prefix}\`\n\nExample: \`${prefix}help\``,
                color: "blurple",
            });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

            logger.info(`User checked prefix`, {
                userId: interaction.user.id,
                guildId: interaction.guildId
            });
        } catch (error) {
            logger.error("Prefix command error:", error);
            await handleInteractionError(interaction, error, { subtype: "prefix_failed" });
        }
    }
};
