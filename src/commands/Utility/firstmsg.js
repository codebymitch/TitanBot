import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Utility/firstmsg.js
export default {
    data: new SlashCommandBuilder()
        .setName("firstmsg")
        .setDescription("Get a link to the first message in this channel")
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
    category: "Utility",

    async execute(interaction) {
        await interaction.deferReply({ flags: ["Ephemeral"] });

        try {
            // Fetch the first message in the channel
            const messages = await interaction.channel.messages.fetch({
                limit: 1,
                after: '1',
                cache: false
            });
            
            const firstMessage = messages.first();
            
            if (!firstMessage) {
                return interaction.editReply({
                    embeds: [successEmbed("First Message", "No messages found in this channel!")],
                });
            }
            
            const messageLink = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${firstMessage.id}`;
            
            await interaction.editReply({
                embeds: [
                    successEmbed(
                        "First Message in #" + interaction.channel.name,
                        `[Jump to first message](${messageLink})`
                    ),
                ],
            });
            
        } catch (error) {
            console.error("Error in firstmsg command:", error);
            return interaction.editReply({
                embeds: [errorEmbed("Error", "Failed to fetch the first message.")],
            });
        }
    },
};
