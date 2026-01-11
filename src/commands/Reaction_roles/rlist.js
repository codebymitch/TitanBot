import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Reaction_roles/rlist.js
export default {
    data: new SlashCommandBuilder()
        .setName('rlist')
        .setDescription('List all reaction role messages in this server')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            // Get all reaction role messages for this guild
            const allKeysResult = await interaction.client.db.list();
            const allKeys = allKeysResult?.value || [];
            const guildReactionRoles = [];

            for (const key of allKeys) {
                if (key.startsWith('reaction_roles_')) {
                    const dataResult = await interaction.client.db.get(key);
                    const data = dataResult?.value || dataResult;
                    if (data && data.guildId === interaction.guildId) {
                        guildReactionRoles.push(data);
                    }
                }
            }

            if (guildReactionRoles.length === 0) {
                return interaction.editReply({
                    embeds: [errorEmbed('No Reaction Roles', 'There are no reaction role messages in this server.')]
                });
            }

            const embed = new EmbedBuilder()
                .setTitle('Reaction Role Messages')
                .setColor(0x3498DB)
                .setDescription('List of all active reaction role messages:');

            for (const rr of guildReactionRoles) {
                const channel = await interaction.guild.channels.fetch(rr.channelId).catch(() => null);
                const message = channel ? await channel.messages.fetch(rr.messageId).catch(() => null) : null;
                
                embed.addFields({
                    name: `Message ID: ${rr.messageId}`,
                    value: `Channel: ${channel || 'Unknown'}\n` +
                           `Message: ${message ? `[Jump to Message](${message.url})` : 'Message not found'}\n` +
                           `Roles: ${rr.roles.length} roles configured`
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error listing reaction roles:', error);
            interaction.editReply({
                embeds: [errorEmbed('Error', 'An error occurred while listing reaction roles.')]
            });
        }
    }
};
