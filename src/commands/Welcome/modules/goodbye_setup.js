import { getColor } from '../../../config/bot.js';
import { EmbedBuilder } from 'discord.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../../../utils/database.js';
import { formatWelcomeMessage, truncateForEmbedField } from '../../../utils/welcome.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';

export async function executeGoodbyeSetup(interaction, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) {
        logger.warn(`Goodbye interaction defer failed`, {
            userId: interaction.user.id,
            guildId: interaction.guildId,
            commandName: 'welcome'
        });
        return;
    }

    const { options, guild } = interaction;

    const channel = options.getChannel('channel');
    const message = options.getString('message');
    const image = options.getString('image');
    const ping = options.getBoolean('ping') ?? false;

    const existingConfig = await getWelcomeConfig(client, guild.id);
    if (existingConfig?.goodbyeChannelId) {
        logger.info(`[Goodbye] Setup blocked because config already exists in channel ${existingConfig.goodbyeChannelId} for guild ${guild.id}`);
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Goodbye is already configured for <#${existingConfig.goodbyeChannelId}>. Use **/welcome dashboard** to customize channel, message, ping, or image.` });
    }

    if (!message || message.trim().length === 0) {
        logger.warn(`[Goodbye] Empty message provided by ${interaction.user.tag} in ${guild.name}`);
        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Goodbye message cannot be empty' });
    }

    if (image) {
        try {
            new URL(image);
        } catch (e) {
            logger.warn(`[Goodbye] Invalid image URL provided by ${interaction.user.tag}: ${image}`);
            return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Please provide a valid image URL (must start with http:// or https://' });
        }
    }

    try {
        await updateWelcomeConfig(client, guild.id, {
            goodbyeEnabled: true,
            goodbyeChannelId: channel.id,
            leaveMessage: message,
            goodbyePing: ping,
            leaveEmbed: {
                title: "Goodbye {user.tag}",
                description: message,
                color: getColor('error'),
                footer: `Goodbye from ${guild.name}!`,
                ...(image && { image: { url: image } })
            }
        });

        logger.info(`[Goodbye] Setup configured by ${interaction.user.tag} for guild ${guild.name} (${guild.id})`);

        const previewMessage = formatWelcomeMessage(message, {
            user: interaction.user,
            guild
        });

        const embed = new EmbedBuilder()
            .setColor(getColor('success'))
            .setTitle('Goodbye System Configured')
            .setDescription(`Goodbye messages will now be sent to ${channel}`)
            .addFields(
                { name: 'Message Preview', value: truncateForEmbedField(previewMessage) },
                { name: 'Ping User', value: ping ? 'Yes' : 'No' },
                { name: 'Status', value: 'Enabled' }
            )
            .setFooter({ text: 'Tip: Use /welcome dashboard to customize goodbye settings' });

        if (image) {
            embed.setImage(image);
        }

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (error) {
        logger.error(`[Goodbye] Failed to setup goodbye system for guild ${guild.id}:`, error);
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'An error occurred while configuring the goodbye system. Please try again.' });
    }
}
