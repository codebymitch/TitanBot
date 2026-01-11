import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
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
            const reactionRoleData = await interaction.client.db.get(`reaction_roles_${messageId}`);

            if (!reactionRoleData || reactionRoleData.guildId !== interaction.guildId) {
                return interaction.editReply({
                    embeds: [errorEmbed('Error', 'No reaction role message found with that ID in this server.')]
                });
            }

            // Delete the message if possible
            try {
                const channel = await interaction.guild.channels.fetch(reactionRoleData.channelId);
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
            await interaction.client.db.delete(`reaction_roles_${messageId}`);

            await interaction.editReply({
                embeds: [successEmbed('Success', 'Reaction role message has been deleted.')]
            });

        } catch (error) {
            console.error('Error deleting reaction role:', error);
            interaction.editReply({
                embeds: [errorEmbed('Error', 'An error occurred while deleting the reaction role message.')]
            });
        }
    }
};
