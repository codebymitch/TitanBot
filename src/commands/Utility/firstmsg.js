import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
// Migrated from: commands/Utility/firstmsg.js
export default {
    data: new SlashCommandBuilder()
        .setName("firstmsg")
        .setDescription("Get a link to the first message in this channel")
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
    category: "Utility",

    async execute(interaction, config, client) {
        const commandBody = async () => {
            try {
                // Fetch the first message in the channel
                const messages = await interaction.channel.messages.fetch({
                    limit: 1,
                    after: '1',
                    cache: false
                });
                
                const firstMessage = messages.first();
                
                if (!firstMessage) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [successEmbed("First Message", "No messages found in this channel!")],
                    });
                }
                
                const messageLink = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${firstMessage.id}`;
                
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            "First Message in #" + interaction.channel.name,
                            `[Jump to first message](${messageLink})`
                        ),
                    ],
                });
                
            } catch (error) {
                console.error("Error in firstmsg command:", error);
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed("Error", "Failed to fetch the first message.")],
                });
            }
        };

        // If the interaction is already deferred or replied, avoid deferring again
        if (interaction.deferred || interaction.replied) {
            try {
                await commandBody();
            } catch (error) {
                console.error('FirstMsg execution error when interaction already acknowledged:', error);
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('System Error', 'Could not complete the command.')],
                });
            }
            return;
        }

        // Otherwise use the safeExecute helper which will defer the reply
        await InteractionHelper.safeExecute(
            interaction,
            commandBody,
            { title: 'Command Error', description: 'Failed to execute command. Please try again later.' }
        );
    },
};
