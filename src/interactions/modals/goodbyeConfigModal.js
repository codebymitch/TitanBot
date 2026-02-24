import { ChannelType, MessageFlags } from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../../utils/database.js';
import {
    GOODBYE_CONFIG_ACTIONS,
    buildGoodbyeConfigPayload,
    hasGoodbyeSetup,
    isValidImageUrl,
    parseChannelInput
} from '../../commands/Welcome/modules/goodbyeConfig.js';

export default {
    name: 'goodbye_config_modal',
    async execute(interaction, client, args) {
        const action = args[0];

        if (!GOODBYE_CONFIG_ACTIONS.includes(action) || action === 'ping') {
            await interaction.reply({
                embeds: [errorEmbed('Invalid Option', 'That goodbye config form is not supported.')],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const currentConfig = await getWelcomeConfig(client, interaction.guildId);
        if (!hasGoodbyeSetup(currentConfig)) {
            await interaction.editReply({
                embeds: [errorEmbed('No Goodbye Setup Found', 'Set up goodbye first using **/goodbye setup**.')]
            });
            return;
        }

        const inputValue = interaction.fields.getTextInputValue('value')?.trim() || '';

        try {
            if (action === 'channel') {
                const channelId = parseChannelInput(inputValue);
                if (!channelId) {
                    await interaction.editReply({
                        embeds: [errorEmbed('Invalid Channel', 'Provide a valid channel mention or channel ID.')]
                    });
                    return;
                }

                const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
                if (!channel || channel.type !== ChannelType.GuildText) {
                    await interaction.editReply({
                        embeds: [errorEmbed('Invalid Channel', 'The channel must be a text channel in this server.')]
                    });
                    return;
                }

                await updateWelcomeConfig(client, interaction.guildId, { goodbyeChannelId: channel.id });
            }

            if (action === 'message') {
                if (!inputValue) {
                    await interaction.editReply({
                        embeds: [errorEmbed('Invalid Message', 'Goodbye message cannot be empty.')]
                    });
                    return;
                }

                if (inputValue.length > 2000) {
                    await interaction.editReply({
                        embeds: [errorEmbed('Message Too Long', 'Goodbye message must be 2000 characters or less.')]
                    });
                    return;
                }

                await updateWelcomeConfig(client, interaction.guildId, {
                    leaveMessage: inputValue,
                    leaveEmbed: {
                        ...(currentConfig.leaveEmbed || {}),
                        description: inputValue
                    }
                });
            }

            if (action === 'image') {
                if (inputValue && !isValidImageUrl(inputValue)) {
                    await interaction.editReply({
                        embeds: [errorEmbed('Invalid Image URL', 'Image URL must start with `http://` or `https://`.')]
                    });
                    return;
                }

                const existingLeaveEmbed = currentConfig.leaveEmbed || {};
                const nextLeaveEmbed = { ...existingLeaveEmbed };

                if (inputValue) {
                    nextLeaveEmbed.image = inputValue;
                } else {
                    delete nextLeaveEmbed.image;
                }

                await updateWelcomeConfig(client, interaction.guildId, {
                    leaveEmbed: nextLeaveEmbed
                });
            }

            const updatedConfig = await getWelcomeConfig(client, interaction.guildId);
            await interaction.editReply(
                buildGoodbyeConfigPayload(
                    interaction.guild,
                    updatedConfig,
                    `${action.charAt(0).toUpperCase()}${action.slice(1)} setting updated successfully.`
                )
            );

            logger.info(`[Goodbye Config] ${action} updated in guild ${interaction.guildId}`);
        } catch (error) {
            logger.error(`[Goodbye Config] Failed to update ${action} in guild ${interaction.guildId}:`, error);
            await interaction.editReply({
                embeds: [errorEmbed('Update Failed', 'An error occurred while updating your goodbye config.')]
            });
        }
    }
};