import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { botConfig } from '../../config/botConfig.js';
import { logger } from '../../utils/logger.js';

function formatUptime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const d = Math.floor(totalSeconds / 86400);
    const h = Math.floor((totalSeconds % 86400) / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean).join(' ');
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default {
    ownerOnly: true,
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Bot admin commands (owner only)')
        .addSubcommand(sub =>
            sub.setName('stats')
                .setDescription('View global bot statistics')
        )
        .addSubcommand(sub =>
            sub.setName('dm')
                .setDescription('Send a DM to any user by ID')
                .addStringOption(opt =>
                    opt.setName('user_id')
                        .setDescription('The user ID to DM')
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('message')
                        .setDescription('The message to send')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('broadcast')
                .setDescription("Send a message to a server's system/first channel")
                .addStringOption(opt =>
                    opt.setName('server_id')
                        .setDescription('The server ID to broadcast to')
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('message')
                        .setDescription('The message to broadcast')
                        .setRequired(true)
                )
        )
        .addSubcommandGroup(group =>
            group.setName('guild')
                .setDescription('Guild management')
                .addSubcommand(sub =>
                    sub.setName('info')
                        .setDescription('Get details about a specific guild')
                        .addStringOption(opt =>
                            opt.setName('server_id')
                                .setDescription('The server ID')
                                .setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub.setName('leave')
                        .setDescription('Make the bot leave a guild')
                        .addStringOption(opt =>
                            opt.setName('server_id')
                                .setDescription('The server ID to leave')
                                .setRequired(true)
                        )
                        .addStringOption(opt =>
                            opt.setName('confirm')
                                .setDescription('Type "confirm" to proceed')
                                .setRequired(true)
                        )
                )
        ),
    category: 'Admin',

    async execute(interaction, config, client) {
        const isAuthorized = botConfig.commands.owners.includes(interaction.user.id)
            || botConfig.commands.admins.includes(interaction.user.id);

        if (!isAuthorized) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Access Denied', 'This command is restricted to bot owners and admins.')],
                ephemeral: true,
            });
        }

        const sub = interaction.options.getSubcommand();
        const group = interaction.options.getSubcommandGroup(false);

        // /admin stats
        if (sub === 'stats') {
            await InteractionHelper.safeDefer(interaction, { ephemeral: true });

            const guilds = [...client.guilds.cache.values()];
            const totalMembers = guilds.reduce((sum, g) => sum + g.memberCount, 0);
            const mem = process.memoryUsage();
            const uptime = formatUptime(client.uptime ?? 0);
            const ping = client.ws.ping;

            return InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: '📊 Bot Statistics',
                    color: 'primary',
                }).addFields(
                    { name: '🌐 Servers', value: guilds.length.toLocaleString(), inline: true },
                    { name: '👥 Total Members', value: totalMembers.toLocaleString(), inline: true },
                    { name: '📡 Ping', value: `${ping}ms`, inline: true },
                    { name: '⏱️ Uptime', value: uptime, inline: true },
                    { name: '💾 Heap Used', value: formatBytes(mem.heapUsed), inline: true },
                    { name: '💾 RSS', value: formatBytes(mem.rss), inline: true },
                    { name: '🤖 Commands', value: client.commands?.size?.toString() ?? '?', inline: true },
                    { name: '📦 Node.js', value: process.version, inline: true },
                )],
            });
        }

        // /admin dm <user_id> <message>
        if (sub === 'dm') {
            const userId = interaction.options.getString('user_id');
            const message = interaction.options.getString('message');

            if (!/^\d{17,20}$/.test(userId)) {
                return InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed('Invalid ID', 'That does not look like a valid user ID.')],
                    ephemeral: true,
                });
            }

            await InteractionHelper.safeDefer(interaction, { ephemeral: true });

            try {
                const user = await client.users.fetch(userId);
                await user.send(message);
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [createEmbed({
                        title: '✉️ DM Sent',
                        description: `Successfully sent a DM to **${user.tag}** (\`${userId}\`).`,
                        color: 'success',
                    })],
                });
            } catch (err) {
                logger.error('admin dm error:', err);
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Failed to Send DM', err.code === 50007
                        ? 'User has DMs disabled or has blocked the bot.'
                        : 'Could not find or DM that user.')],
                });
            }
        }

        // /admin broadcast <server_id> <message>
        if (sub === 'broadcast') {
            const serverId = interaction.options.getString('server_id');
            const message = interaction.options.getString('message');

            if (!/^\d{17,20}$/.test(serverId)) {
                return InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed('Invalid ID', 'That does not look like a valid server ID.')],
                    ephemeral: true,
                });
            }

            await InteractionHelper.safeDefer(interaction, { ephemeral: true });

            const guild = client.guilds.cache.get(serverId);
            if (!guild) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Server Not Found', 'The bot is not in a server with that ID.')],
                });
            }

            const channel = guild.systemChannel
                ?? guild.channels.cache
                    .filter(c => c.isTextBased() && c.permissionsFor(guild.members.me)?.has('SendMessages'))
                    .sort((a, b) => a.position - b.position)
                    .first();

            if (!channel) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('No Channel', `Could not find a writable channel in **${guild.name}**.`)],
                });
            }

            try {
                await channel.send(message);
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [createEmbed({
                        title: '📢 Broadcast Sent',
                        description: `Message sent to **${guild.name}** in <#${channel.id}>.`,
                        color: 'success',
                    })],
                });
            } catch (err) {
                logger.error('admin broadcast error:', err);
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Broadcast Failed', 'Could not send the message to that server.')],
                });
            }
        }

        // /admin guild info <server_id>
        if (group === 'guild' && sub === 'info') {
            const serverId = interaction.options.getString('server_id');

            if (!/^\d{17,20}$/.test(serverId)) {
                return InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed('Invalid ID', 'That does not look like a valid server ID.')],
                    ephemeral: true,
                });
            }

            await InteractionHelper.safeDefer(interaction, { ephemeral: true });

            const guild = client.guilds.cache.get(serverId);
            if (!guild) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Server Not Found', 'The bot is not in a server with that ID.')],
                });
            }

            try {
                const fullGuild = await guild.fetch();
                const owner = await client.users.fetch(fullGuild.ownerId).catch(() => null);
                const created = `<t:${Math.floor(fullGuild.createdTimestamp / 1000)}:F>`;
                const botCount = fullGuild.members.cache.filter(m => m.user.bot).size;

                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [createEmbed({
                        title: `🏠 ${fullGuild.name}`,
                        color: 'primary',
                    }).addFields(
                        { name: '🆔 Server ID', value: `\`${fullGuild.id}\``, inline: true },
                        { name: '👑 Owner', value: owner ? `${owner.tag} (\`${owner.id}\`)` : `\`${fullGuild.ownerId}\``, inline: true },
                        { name: '👥 Members', value: fullGuild.memberCount.toLocaleString(), inline: true },
                        { name: '🤖 Bots', value: botCount.toLocaleString(), inline: true },
                        { name: '🗂️ Channels', value: fullGuild.channels.cache.size.toLocaleString(), inline: true },
                        { name: '🎭 Roles', value: fullGuild.roles.cache.size.toLocaleString(), inline: true },
                        { name: '📅 Created', value: created, inline: false },
                    )],
                });
            } catch (err) {
                logger.error('admin guild info error:', err);
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Error', 'Failed to fetch guild information.')],
                });
            }
        }

        // /admin guild leave <server_id> confirm
        if (group === 'guild' && sub === 'leave') {
            const serverId = interaction.options.getString('server_id');
            const confirm = interaction.options.getString('confirm');

            if (!/^\d{17,20}$/.test(serverId)) {
                return InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed('Invalid ID', 'That does not look like a valid server ID.')],
                    ephemeral: true,
                });
            }

            if (confirm !== 'confirm') {
                return InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed('Not Confirmed', 'You must type `confirm` in the confirm field to leave a server.')],
                    ephemeral: true,
                });
            }

            const guild = client.guilds.cache.get(serverId);
            if (!guild) {
                return InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed('Server Not Found', 'The bot is not in a server with that ID.')],
                    ephemeral: true,
                });
            }

            const guildName = guild.name;
            await InteractionHelper.safeDefer(interaction, { ephemeral: true });

            try {
                await guild.leave();
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [createEmbed({
                        title: '🚪 Left Server',
                        description: `Successfully left **${guildName}** (\`${serverId}\`).`,
                        color: 'warning',
                    })],
                });
            } catch (err) {
                logger.error('admin guild leave error:', err);
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Error', 'Failed to leave that server.')],
                });
            }
        }
    },
};
