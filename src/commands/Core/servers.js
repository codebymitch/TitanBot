import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { botConfig } from '../../config/botConfig.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('servers')
        .setDescription('Owner-only server management commands')
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all servers the bot is currently in')
        )
        .addSubcommand(sub =>
            sub.setName('forcejoin')
                .setDescription('Generate a pre-targeted invite link to join a specific server')
                .addStringOption(opt =>
                    opt.setName('server_id')
                        .setDescription('The ID of the server to join')
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('permissions')
                        .setDescription('Permission level the bot requests (default: Admin)')
                        .setRequired(false)
                        .addChoices(
                            { name: '👑 Admin — full access', value: 'admin' },
                            { name: '🛡️ Moderator — kick, ban, manage messages & channels', value: 'mod' },
                            { name: '✉️ Minimal — view, send messages, embed links', value: 'minimal' },
                            { name: '0️⃣ None — no permissions (owner assigns manually)', value: 'none' },
                        )
                )
        ),
    category: 'Core',

    async execute(interaction, config, client) {
        if (!botConfig.commands.owners.includes(interaction.user.id)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Access Denied', 'This command is restricted to the bot owner.')],
                ephemeral: true,
            });
        }

        const sub = interaction.options.getSubcommand();

        if (sub === 'forcejoin') {
            const serverId = interaction.options.getString('server_id');
            const permPreset = interaction.options.getString('permissions') ?? 'admin';

            const PRESETS = {
                admin:   { bits: '8',             label: '👑 Admin',     note: 'Full Administrator access' },
                mod:     { bits: '1101927672854',  label: '🛡️ Moderator', note: 'Kick, ban, manage messages & channels, moderate members' },
                minimal: { bits: '2147568640',     label: '✉️ Minimal',   note: 'View channels, send messages, embed links' },
                none:    { bits: '0',              label: '0️⃣ None',      note: 'No permissions — server owner assigns roles manually' },
            };

            const preset = PRESETS[permPreset] ?? PRESETS.admin;

            if (!/^\d{17,20}$/.test(serverId)) {
                return InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed('Invalid ID', "That doesn't look like a valid server ID. Server IDs are 17–20 digit numbers.")],
                    ephemeral: true,
                });
            }

            if (client.guilds.cache.has(serverId)) {
                const guild = client.guilds.cache.get(serverId);
                return InteractionHelper.safeReply(interaction, {
                    embeds: [createEmbed({
                        title: '⚠️ Already In Server',
                        description: `The bot is already in **${guild.name}** (\`${serverId}\`).`,
                        color: 'warning',
                    })],
                    ephemeral: true,
                });
            }

            const inviteUrl =
                `https://discord.com/oauth2/authorize` +
                `?client_id=${client.user.id}` +
                `&permissions=${preset.bits}` +
                `&scope=bot%20applications.commands` +
                `&guild_id=${serverId}` +
                `&disable_guild_select=true`;

            const joinButton = new ButtonBuilder()
                .setLabel('Join Server')
                .setURL(inviteUrl)
                .setStyle(ButtonStyle.Link)
                .setEmoji('➕');

            return InteractionHelper.safeReply(interaction, {
                embeds: [createEmbed({
                    title: '🔗 Force Join Link',
                    description: `Click the button to add the bot to server \`${serverId}\`.\nYou must have **Manage Server** or **Administrator** in that server.\n\n**Permission level:** ${preset.label}\n*${preset.note}*`,
                    color: 'primary',
                })],
                components: [new ActionRowBuilder().addComponents(joinButton)],
                ephemeral: true,
            });
        }

        // sub === 'list'
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
