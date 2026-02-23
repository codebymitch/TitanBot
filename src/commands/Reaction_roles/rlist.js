import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, EmbedBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getAllReactionRoleMessages } from '../../services/reactionRoleService.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('rlist')
        .setDescription('List all reaction role messages in this server')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        try {
            
            const deferSuccess = await InteractionHelper.safeDefer(interaction);
            if (!deferSuccess) return;
            
            logger.info(`Reaction role list requested by ${interaction.user.tag} in guild ${interaction.guild.name}`);
            
            
            const guildReactionRoles = await getAllReactionRoleMessages(interaction.client, interaction.guildId);

            if (guildReactionRoles.length === 0) {
                logger.debug(`No reaction role messages found in guild ${interaction.guild.name}`);
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [infoEmbed('No Reaction Roles', 'There are no reaction role messages in this server.')]
                });
            }

            const embed = new EmbedBuilder()
                .setTitle('🎭 Reaction Role Messages')
                .setColor(getColor('info'))
                .setDescription(`Found **${guildReactionRoles.length}** active reaction role message${guildReactionRoles.length !== 1 ? 's' : ''}:`)
                .setFooter({ text: `Total: ${guildReactionRoles.length} message${guildReactionRoles.length !== 1 ? 's' : ''}` })
                .setTimestamp();

            for (const rr of guildReactionRoles) {
                try {
                    const channel = await interaction.guild.channels.fetch(rr.channelId).catch(() => null);
                    const message = channel ? await channel.messages.fetch(rr.messageId).catch(() => null) : null;
                    
                    
                    let roleCount = 0;
                    if (Array.isArray(rr.roles)) {
                        roleCount = rr.roles.length;
                    } else if (typeof rr.roles === 'object') {
                        roleCount = Object.keys(rr.roles).length;
                    }
                    
                    
                    let fieldValue = '';
                    fieldValue += `📍 **Channel:** ${channel ? channel.toString() : '❌ Not found'}\n`;
                    fieldValue += `🔗 **Message:** ${message ? `[Jump to Message](${message.url})` : '❌ Message not found'}\n`;
                    fieldValue += `🏷️ **Roles:** ${roleCount} role${roleCount !== 1 ? 's' : ''} configured`;
                    
                    
                    if (rr.createdAt) {
                        fieldValue += `\n📅 **Created:** <t:${Math.floor(new Date(rr.createdAt).getTime() / 1000)}:R>`;
                    }
                    
                    embed.addFields({
                        name: `Message ID: \`${rr.messageId}\``,
                        value: fieldValue,
                        inline: false
                    });
                } catch (fieldError) {
                    logger.warn(`Error processing reaction role message ${rr.messageId}:`, fieldError);
                    embed.addFields({
                        name: `Message ID: \`${rr.messageId}\``,
                        value: '⚠️ Error loading message details',
                        inline: false
                    });
                }
            }

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            logger.info(`Reaction role list displayed to ${interaction.user.tag}, showing ${guildReactionRoles.length} messages`);

        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'rlist'
            });
        }
    }
};


