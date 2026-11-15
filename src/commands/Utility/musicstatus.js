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
    lines.push(`${EMOJI_AVAILABLE} **Tersedia** · ${availableCount}`);
    lines.push(`${EMOJI_IN_USE} **Sedang digunakan** · ${inUseCount}`);
    lines.push('');

    if (groups.length === 0) {
        lines.push('Belum ada grup bot musik yang dikonfigurasi.');
        lines.push('Gunakan `/musicstatus group add` untuk membuat grup pertama.');
    }

    for (const group of groups) {
        lines.push('═════════════════════');
        lines.push(`**${group.name}**`);
        lines.push('');

        if (group.bots.length === 0) {
            lines.push('_Belum ada bot di grup ini._');
            lines.push('');
            continue;
        }

        for (const bot of group.bots) {
            const statusEmoji = bot.inVoice ? EMOJI_IN_USE : EMOJI_AVAILABLE;
            const statusLabel = bot.inVoice ? 'digunakan' : 'Tersedia';
            lines.push(`${statusEmoji} **${truncate(bot.displayName, 40)}** · ${statusLabel}`);

            if (bot.inVoice) {
                const channel = bot.voiceChannelId
                    ? `<#${bot.voiceChannelId}>`
                    : '—';
                lines.push(`└ ${channel}`);
            } else {
                lines.push('└ Belum terhubung ke voice');
            }

            lines.push('');
        }
    }

    const description = lines.join('\n');

    return createEmbed({
        title: `STATUS MUSIC ${guildName.toUpperCase()}`,
        description,
        color: 'primary',
        footer: total > 0 ? `Total ${total} bot musik` : null,
    });
}

export default {
    data: new SlashCommandBuilder()
        .setName('musicstatus')
        .setDescription('Lihat dan kelola status bot musik di server ini.')
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub
                .setName('view')
                .setDescription('Tampilkan status semua bot musik yang terdaftar.'),
        )
        .addSubcommand(sub =>
            sub
                .setName('add')
                .setDescription('Tambahkan bot musik ke dalam grup.')
                .addUserOption(opt =>
                    opt
                        .setName('bot')
                        .setDescription('Bot musik yang ingin didaftarkan.')
                        .setRequired(true),
                )
                .addStringOption(opt =>
                    opt
                        .setName('group')
                        .setDescription('Nama grup (akan dibuat otomatis jika belum ada).')
                        .setRequired(true),
                ),
        )
        .addSubcommand(sub =>
            sub
                .setName('remove')
                .setDescription('Hapus bot musik dari grup.')
                .addUserOption(opt =>
                    opt
                        .setName('bot')
                        .setDescription('Bot musik yang ingin dihapus.')
                        .setRequired(true),
                )
                .addStringOption(opt =>
                    opt
                        .setName('group')
                        .setDescription('Nama grup tempat bot berada.')
                        .setRequired(true),
                ),
        )
        .addSubcommandGroup(group =>
            group
                .setName('group')
                .setDescription('Kelola grup bot musik.')
                .addSubcommand(sub =>
                    sub
                        .setName('add')
                        .setDescription('Buat grup bot musik baru.')
                        .addStringOption(opt =>
                            opt
                                .setName('name')
                                .setDescription('Nama grup.')
                                .setRequired(true),
                        ),
                )
                .addSubcommand(sub =>
                    sub
                        .setName('remove')
                        .setDescription('Hapus grup bot musik.')
                        .addStringOption(opt =>
                            opt
                                .setName('name')
                                .setDescription('Nama grup yang akan dihapus.')
                                .setRequired(true),
                        ),
                )
                .addSubcommand(sub =>
                    sub
                        .setName('edit')
                        .setDescription('Ubah nama grup bot musik.')
                        .addStringOption(opt =>
                            opt
                                .setName('name')
                                .setDescription('Nama grup saat ini.')
                                .setRequired(true),
                        )
                        .addStringOption(opt =>
                            opt
                                .setName('newname')
                                .setDescription('Nama baru untuk grup.')
                                .setRequired(true),
                        ),
                )
                .addSubcommand(sub =>
                    sub
                        .setName('list')
                        .setDescription('Tampilkan daftar grup dan bot di dalamnya.'),
                ),
        )
        .addSubcommandGroup(group =>
            group
                .setName('live')
                .setDescription('Kelola status bot musik live (auto-refresh).')
                .addSubcommand(sub =>
                    sub
                        .setName('start')
                        .setDescription('Kirim status bot musik yang otomatis ter-refresh ke channel ini.'),
                )
                .addSubcommand(sub =>
                    sub
                        .setName('stop')
                        .setDescription('Hentikan auto-refresh status bot musik.'),
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
                        'Kamu butuh izin **Manage Server** untuk menggunakan command ini.',
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
                    ? (error.userMessage || 'Terjadi kesalahan.')
                    : 'Terjadi kesalahan yang tidak terduga.';

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
            'Pengguna yang kamu pilih bukan bot. Pilih akun bot musik.',
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
            `Grup **${groupName}** tidak ditemukan.`,
        );
    }

    await removeBot(client, guildId, group.id, botUser.id);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed(
            'Bot Dihapus',
            `**${botUser.username}** telah dihapus dari grup **${group.name}**.`,
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
            'Grup Dibuat',
            `Grup **${group.name}** berhasil dibuat. Gunakan \`/musicstatus add\` untuk menambahkan bot.`,
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
            `Grup **${name}** tidak ditemukan.`,
        );
    }

    await deleteGroup(client, guildId, group.id);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed(
            'Grup Dihapus',
            `Grup **${group.name}** dan semua bot di dalamnya telah dihapus.`,
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
            `Grup **${name}** tidak ditemukan.`,
        );
    }

    const updated = await renameGroup(client, guildId, group.id, newName);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed(
            'Grup Diperbarui',
            `Grup **${name}** berhasil diubah menjadi **${updated.name}**.`,
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
            embeds: [infoEmbedWrap('Belum Ada Grup', 'Buat grup pertama dengan `/musicstatus group add`.')],
        });
        return;
    }

    const fields = config.groups.map(group => ({
        name: `${group.name} (${group.bots.length} bot)`,
        value: group.bots.length > 0
            ? group.bots.map(b => `<@${b.id}>`).join(', ')
            : '_Kosong_',
        inline: false,
    }));

    const embed = createEmbed({
        title: 'Daftar Grup Bot Musik',
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
                'Live Status Sudah Aktif',
                'Live status bot musik sudah berjalan di channel lain. Gunakan `/musicstatus live stop` terlebih dahulu jika ingin pindah channel.',
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
            'Live Status Aktif',
            `Status bot musik sekarang otomatis ter-refresh setiap 30 detik di channel ini.`,
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
                'Tidak Ada Live Status',
                'Live status bot musik belum diaktifkan. Gunakan `/musicstatus live start` untuk mengaktifkannya.',
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
            'Live Status Dihentikan',
            'Auto-refresh status bot musik telah dihentikan.',
        )],
    });
}
