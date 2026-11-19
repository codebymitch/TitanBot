import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import {
    getMusicStatusConfig,
    createGroup,
    deleteGroup,
    renameGroup,
    addBot,
    removeBot,
    buildStatusSnapshot,
    buildLiveStatusEmbed,
    setLiveMessage,
    clearLiveMessage,
} from '../../services/musicStatusService.js';

const EMOJI_AVAILABLE = '<a:loadinggreen:1570737155142189096>';
const EMOJI_IN_USE = '<a:loadingred:1570737219738804295>';

function hasManageGuildPermission(member) {
    return member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) ?? false;
}

function findGroupByName(groups, name) {
    const target = String(name || '').trim().toLowerCase();
    return groups.find(g => g.name.toLowerCase() === target);
}

function truncate(str, max) {
    const s = String(str || '');
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function buildStatusEmbed(snapshot, guildName) {
    const { groups, availableCount, inUseCount } = snapshot;
    const total = availableCount + inUseCount;

    const lines = [];
    lines.push(`${EMOJI_AVAILABLE} **Available** · ${availableCount}`);
    lines.push(`${EMOJI_IN_USE} **In use** · ${inUseCount}`);
    lines.push('');

    if (groups.length === 0) {
        lines.push('No music bot groups are configured yet.');
        lines.push('Use `/musicstatus group add` to create the first group.');
    }

    for (const group of groups) {
        lines.push('═════════════════════');
        lines.push(`**${group.name}**`);
        lines.push('');

        if (group.bots.length === 0) {
            lines.push('_No bots in this group yet._');
            lines.push('');
            continue;
        }

        for (const bot of group.bots) {
            const statusEmoji = bot.inVoice ? EMOJI_IN_USE : EMOJI_AVAILABLE;
            const statusLabel = bot.inVoice ? 'In use' : 'Available';
            lines.push(`${statusEmoji} **${truncate(bot.displayName, 40)}** · ${statusLabel}`);

            if (bot.inVoice) {
                const channel = bot.voiceChannelId
                    ? `<#${bot.voiceChannelId}>`
                    : '—';
                lines.push(`└ ${channel}`);
            } else {
                lines.push('└ Not connected to voice');
            }

            lines.push('');
        }
    }

    const description = lines.join('\n');

    return createEmbed({
        title: `MUSIC STATUS ${guildName.toUpperCase()}`,
        description,
        color: 'primary',
        footer: total > 0 ? `Total ${total} music bots` : null,
    });
}

export default {
    data: new SlashCommandBuilder()
        .setName('musicstatus')
        .setDescription('View and manage music bot status in this server.')
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub
                .setName('view')
                .setDescription('Show the status of all registered music bots.'),
        )
        .addSubcommand(sub =>
            sub
                .setName('add')
                .setDescription('Add a music bot to a group.')
                .addUserOption(opt =>
                    opt
                        .setName('bot')
                        .setDescription('The music bot to register.')
                        .setRequired(true),
                )
                .addStringOption(opt =>
                    opt
                        .setName('group')
                        .setDescription('Group name (created automatically if it does not exist).')
                        .setRequired(true),
                ),
        )
        .addSubcommand(sub =>
            sub
                .setName('remove')
                .setDescription('Remove a music bot from a group.')
                .addUserOption(opt =>
                    opt
                        .setName('bot')
                        .setDescription('The music bot to remove.')
                        .setRequired(true),
                )
                .addStringOption(opt =>
                    opt
                        .setName('group')
                        .setDescription('The group the bot is in.')
                        .setRequired(true),
                ),
        )
        .addSubcommandGroup(group =>
            group
                .setName('group')
                .setDescription('Manage music bot groups.')
                .addSubcommand(sub =>
                    sub
                        .setName('add')
                        .setDescription('Create a new music bot group.')
                        .addStringOption(opt =>
                            opt
                                .setName('name')
                                .setDescription('Group name.')
                                .setRequired(true),
                        ),
                )
                .addSubcommand(sub =>
                    sub
                        .setName('remove')
                        .setDescription('Delete a music bot group.')
                        .addStringOption(opt =>
                            opt
                                .setName('name')
                                .setDescription('The name of the group to delete.')
                                .setRequired(true),
                        ),
                )
                .addSubcommand(sub =>
                    sub
                        .setName('edit')
                        .setDescription('Rename a music bot group.')
                        .addStringOption(opt =>
                            opt
                                .setName('name')
                                .setDescription('The current group name.')
                                .setRequired(true),
                        )
                        .addStringOption(opt =>
                            opt
                                .setName('newname')
                                .setDescription('The new name for the group.')
                                .setRequired(true),
                        ),
                )
                .addSubcommand(sub =>
                    sub
                        .setName('list')
                        .setDescription('Show the list of groups and their bots.'),
                ),
        )
        .addSubcommandGroup(group =>
            group
                .setName('live')
                .setDescription('Manage live music bot status (auto-refresh).')
                .addSubcommand(sub =>
                    sub
                        .setName('start')
                        .setDescription('Send an auto-refreshing music bot status to this channel.'),
                )
                .addSubcommand(sub =>
                    sub
                        .setName('stop')
                        .setDescription('Stop auto-refreshing music bot status.'),
                ),
        ),

    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand(true);
            const subcommandGroup = interaction.options.getSubcommandGroup();
            const isGroupCmd = subcommandGroup === 'group';
            const isLiveCmd = subcommandGroup === 'live';

            // view & group list tidak butuh ManageGuild
            if (subcommand !== 'view' && !(isGroupCmd && subcommand === 'list')) {
                if (!hasManageGuildPermission(interaction.member)) {
                    throw new TitanBotError(
                        'User lacks ManageGuild permission',
                        ErrorTypes.PERMISSION,
                        'You need **Manage Server** permission to use this command.',
                    );
                }
            }

            if (subcommand === 'view') {
                await handleView(interaction);
                return;
            }

            if (isGroupCmd && subcommand === 'list') {
                await handleGroupList(interaction);
                return;
            }

            // live start/stop tidak ephemeral (kirim ke channel)
            if (isLiveCmd) {
                if (subcommand === 'start') {
                    await handleLiveStart(interaction);
                } else if (subcommand === 'stop') {
                    await handleLiveStop(interaction);
                }
                return;
            }

            // Command yang membutuhkan manage guild — defer ephemeral
            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

            if (isGroupCmd) {
                if (subcommand === 'add') {
                    await handleGroupAdd(interaction);
                } else if (subcommand === 'remove') {
                    await handleGroupRemove(interaction);
                } else if (subcommand === 'edit') {
                    await handleGroupEdit(interaction);
                }
            } else if (subcommand === 'add') {
                await handleAdd(interaction);
            } else if (subcommand === 'remove') {
                await handleRemove(interaction);
            }
        } catch (error) {
            try {
                const message = error instanceof TitanBotError
                    ? (error.userMessage || 'Something went wrong.')
                    : 'An unexpected error occurred.';

                if (error instanceof TitanBotError) {
                    logger.debug(`musicstatus TitanBotError [${error.type}]: ${error.message}`, error.context || {});
                } else {
                    logger.error('Unexpected error in musicstatus command:', error);
                }

                return replyUserError(interaction, { type: error?.type || ErrorTypes.UNKNOWN, message });
            } catch (replyError) {
                logger.error('Failed to send musicstatus error message:', replyError);
            }
        }
    },
};

async function handleView(interaction) {
    await InteractionHelper.safeDefer(interaction);
    const client = interaction.client;
    const guildId = interaction.guildId;

    const config = await getMusicStatusConfig(client, guildId);
    const snapshot = await buildStatusSnapshot(interaction.guild, config);

    const embed = buildStatusEmbed(snapshot, interaction.guild.name);
    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

async function handleAdd(interaction) {
    const client = interaction.client;
    const guildId = interaction.guildId;
    const botUser = interaction.options.getUser('bot', true);
    const groupName = interaction.options.getString('group', true);

    if (!botUser.bot) {
        throw new TitanBotError(
            'Not a bot',
            ErrorTypes.VALIDATION,
            'The user you selected is not a bot. Pick a music bot account.',
        );
    }

    const config = await getMusicStatusConfig(client, guildId);
    let group = findGroupByName(config.groups, groupName);

    if (!group) {
        group = await createGroup(client, guildId, groupName);
    }

    await addBot(client, guildId, group.id, botUser.id);

    // Tampilkan preview status terbaru agar user langsung lihat botnya muncul
    const updatedConfig = await getMusicStatusConfig(client, guildId);
    const snapshot = await buildStatusSnapshot(interaction.guild, updatedConfig);
    const embed = buildStatusEmbed(snapshot, interaction.guild.name);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
    });
}

async function handleRemove(interaction) {
    const client = interaction.client;
    const guildId = interaction.guildId;
    const botUser = interaction.options.getUser('bot', true);
    const groupName = interaction.options.getString('group', true);

    const config = await getMusicStatusConfig(client, guildId);
    const group = findGroupByName(config.groups, groupName);

    if (!group) {
        throw new TitanBotError(
            'Group not found',
            ErrorTypes.VALIDATION,
            `Group **${groupName}** not found.`,
        );
    }

    await removeBot(client, guildId, group.id, botUser.id);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed(
            'Bot Removed',
            `**${botUser.username}** has been removed from group **${group.name}**.`,
        )],
    });
}

async function handleGroupAdd(interaction) {
    const client = interaction.client;
    const guildId = interaction.guildId;
    const name = interaction.options.getString('name', true);

    const group = await createGroup(client, guildId, name);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed(
            'Group Created',
            `Group **${group.name}** was created successfully. Use \`/musicstatus add\` to add a bot.`,
        )],
    });
}

async function handleGroupRemove(interaction) {
    const client = interaction.client;
    const guildId = interaction.guildId;
    const name = interaction.options.getString('name', true);

    const config = await getMusicStatusConfig(client, guildId);
    const group = findGroupByName(config.groups, name);

    if (!group) {
        throw new TitanBotError(
            'Group not found',
            ErrorTypes.VALIDATION,
            `Group **${name}** not found.`,
        );
    }

    await deleteGroup(client, guildId, group.id);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed(
            'Group Deleted',
            `Group **${group.name}** and all bots inside it have been deleted.`,
        )],
    });
}

async function handleGroupEdit(interaction) {
    const client = interaction.client;
    const guildId = interaction.guildId;
    const name = interaction.options.getString('name', true);
    const newName = interaction.options.getString('newname', true);

    const config = await getMusicStatusConfig(client, guildId);
    const group = findGroupByName(config.groups, name);

    if (!group) {
        throw new TitanBotError(
            'Group not found',
            ErrorTypes.VALIDATION,
            `Group **${name}** not found.`,
        );
    }

    const updated = await renameGroup(client, guildId, group.id, newName);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed(
            'Group Updated',
            `Group **${name}** was renamed to **${updated.name}**.`,
        )],
    });
}

async function handleGroupList(interaction) {
    await InteractionHelper.safeDefer(interaction);
    const client = interaction.client;
    const guildId = interaction.guildId;

    const config = await getMusicStatusConfig(client, guildId);

    if (config.groups.length === 0) {
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [infoEmbedWrap('No Groups Yet', 'Create the first group with `/musicstatus group add`.')],
        });
        return;
    }

    const fields = config.groups.map(group => ({
        name: `${group.name} (${group.bots.length} bot)`,
        value: group.bots.length > 0
            ? group.bots.map(b => `<@${b.id}>`).join(', ')
            : '_Empty_',
        inline: false,
    }));

    const embed = createEmbed({
        title: 'Music Bot Group List',
        color: 'info',
        fields,
    });

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

function infoEmbedWrap(title, body) {
    return createEmbed({ title, description: body, color: 'info' });
}

async function handleLiveStart(interaction) {
    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    const client = interaction.client;
    const guildId = interaction.guildId;

    const config = await getMusicStatusConfig(client, guildId);

    if (config.live?.channelId && config.live?.messageId) {
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [infoEmbedWrap(
                'Live Status Already Active',
                'Music bot live status is already running in another channel. Use `/musicstatus live stop` first if you want to move it.',
            )],
        });
        return;
    }

    const snapshot = await buildStatusSnapshot(interaction.guild, config);
    const embed = buildLiveStatusEmbed(snapshot, interaction.guild.name);

    // Kirim pesan live ke channel (terlihat semua orang)
    const liveMessage = await interaction.channel.send({ embeds: [embed] });

    // Simpan referensi ke config
    await setLiveMessage(client, guildId, interaction.channelId, liveMessage.id);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed(
            'Live Status Active',
            `Music bot status now auto-refreshes every 30 seconds in this channel.`,
        )],
    });
}

async function handleLiveStop(interaction) {
    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    const client = interaction.client;
    const guildId = interaction.guildId;

    const config = await getMusicStatusConfig(client, guildId);

    if (!config.live?.channelId || !config.live?.messageId) {
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [infoEmbedWrap(
                'No Live Status',
                'Music bot live status is not enabled yet. Use `/musicstatus live start` to enable it.',
            )],
        });
        return;
    }

    // Coba hapus pesan live sebelumnya (opsional, tidak fatal jika gagal)
    try {
        const channel = interaction.guild.channels.cache.get(config.live.channelId);
        if (channel) {
            const msg = await channel.messages.fetch(config.live.messageId).catch(() => null);
            if (msg) await msg.delete().catch(() => {});
        }
    } catch {
        // abaikan
    }

    await clearLiveMessage(client, guildId);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed(
            'Live Status Stopped',
            'Music bot status auto-refresh has been stopped.',
        )],
    });
}
