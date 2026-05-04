import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { botConfig } from '../../config/botConfig.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('servers')
        .setDescription('List all servers the bot is currently in (owner only)'),
    category: 'core',

    async execute(interaction, config, client) {
        if (!botConfig.commands.owners.includes(interaction.user.id)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Access Denied', 'This command is restricted to the bot owner.')],
                ephemeral: true,
            });
        }

        try {
            await InteractionHelper.safeDefer(interaction, { ephemeral: true });

            const guilds = [...client.guilds.cache.values()].sort((a, b) => b.memberCount - a.memberCount);
            const totalMembers = guilds.reduce((sum, g) => sum + g.memberCount, 0);

            const CHUNK = 20;
            const pages = [];
            for (let i = 0; i < guilds.length; i += CHUNK) {
                pages.push(guilds.slice(i, i + CHUNK));
            }

            const embeds = pages.map((chunk, pageIndex) => {
                const lines = chunk.map((g, i) => {
                    const num = pageIndex * CHUNK + i + 1;
                    return `**${num}.** ${g.name}\n↳ \`${g.id}\` · 👥 ${g.memberCount.toLocaleString()} members`;
                }).join('\n\n');

                return createEmbed({
                    title: `🌐 Servers (${pageIndex + 1}/${pages.length})`,
                    description: lines || 'No servers.',
                    color: 'primary',
                }).addFields(
                    pageIndex === 0
                        ? [{ name: '📊 Summary', value: `**Total servers:** ${guilds.length}\n**Total members:** ${totalMembers.toLocaleString()}`, inline: false }]
                        : []
                );
            });

            if (embeds.length === 0) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [createEmbed({ title: '🌐 Servers', description: 'The bot is not in any servers.', color: 'warning' })],
                });
            }

            const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`;

            const leaveButton = new ButtonBuilder()
                .setCustomId('servers-leave')
                .setLabel('Leave a Server')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🚪');

            const addButton = new ButtonBuilder()
                .setLabel('Add to Server')
                .setURL(inviteUrl)
                .setStyle(ButtonStyle.Link)
                .setEmoji('➕');

            const buttonRow = new ActionRowBuilder().addComponents(leaveButton, addButton);

            // Discord allows up to 10 embeds per message
            await InteractionHelper.safeEditReply(interaction, {
                embeds: embeds.slice(0, 10),
                components: [buttonRow],
            });

            if (embeds.length > 10) {
                for (let i = 10; i < embeds.length; i += 10) {
                    await interaction.followUp({ embeds: embeds.slice(i, i + 10), ephemeral: true });
                }
            }
        } catch (error) {
            logger.error('servers command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Error', 'Failed to fetch server list.')],
            });
        }
    },
};
