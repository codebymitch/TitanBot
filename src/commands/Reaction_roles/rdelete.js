import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Reaction_roles/rdelete.js
export default {
    data: new SlashCommandBuilder()
        .setName('rdelete')
        .setDescription('Delete a reaction role message')
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('The ID of the reaction role message to delete')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const messageId = interaction.options.getString('message_id');
            const key = `reaction_roles:${interaction.guildId}:${messageId}`;
            
            const reactionRoleData = await interaction.client.db.get(key);
            
            // Handle database response format
            let actualData;
            if (reactionRoleData && reactionRoleData.ok && reactionRoleData.value) {
                actualData = reactionRoleData.value;
            } else if (reactionRoleData && reactionRoleData.value) {
                actualData = reactionRoleData.value;
            } else {
                actualData = reactionRoleData;
            }

            if (!actualData) {
                return interaction.editReply({
                    embeds: [errorEmbed('Error', 'No reaction role message found with that ID in this server.')]
                });
            }

            // Delete the message if possible
            try {
                // Try to get the channel - multiple methods
                let channel;
                try {
                    // Method 1: Direct fetch
                    channel = await interaction.guild.channels.fetch(actualData.channelId);
                } catch (channelError) {
                    // Method 2: Try from cache first
                    channel = interaction.guild.channels.cache.get(actualData.channelId);
                    
                    // Method 3: Try using the client's channel cache
                    if (!channel) {
                        channel = interaction.client.channels.cache.get(actualData.channelId);
                    }
                }
                
                if (channel) {
                    const message = await channel.messages.fetch(messageId).catch(() => null);
                    if (message) {
                        await message.delete().catch(() => null);
                    }
                }
            } catch (error) {
                console.error('Error deleting message:', error);
                // Continue even if message deletion fails
            }

            // Remove from database
            try {
                await interaction.client.db.delete(key);
            } catch (dbError) {
                console.error(`[ReactionRole] Error removing from database:`, dbError);
                return interaction.editReply({
                    embeds: [errorEmbed('Database Error', 'Failed to remove reaction role data from database.')]
                });
            }

            await interaction.editReply({
                embeds: [successEmbed('Success', 'Reaction role message has been deleted from the database.')]
            });

        } catch (error) {
            console.error('Error deleting reaction role:', error);
            interaction.editReply({
                embeds: [errorEmbed('Error', 'An error occurred while deleting the reaction role message.')]
            });
        }
    }
};
