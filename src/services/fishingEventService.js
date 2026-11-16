// fishingEventService.js
// Event mancing global (lintas server). Disimpan sebagai satu flag di DB
// (key non-guild), lalu dibaca oleh /fish dan /netting sehingga boost luck
// otomatis berlaku di semua server tanpa menulis inventory siapa pun.

import { getFromDb, setInDb, deleteFromDb, getFishingEventChannelKey } from '../utils/database.js';
import { createEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';

const EVENT_KEY = 'fishing_event:global';

// Ambil event yang sedang aktif. Event otomatis dibersihkan saat sudah lewat.
export async function getFishingEvent() {
    try {
        const event = await getFromDb(EVENT_KEY, null);
        if (!event || !event.active) {
            return null;
        }

        if (event.endsAt && Date.now() >= event.endsAt) {
            await deleteFromDb(EVENT_KEY);
            return null;
        }

        return event;
    } catch (error) {
        logger.error('[EVENT] Failed to read global fishing event', error);
        return null;
    }
}

// Mulai event global. durationMinutes <= 0 berarti berjalan sampai dihentikan.
export async function startFishingEvent({ multiplier, durationMinutes = 60, startedBy = null }) {
    const now = Date.now();
    const safeMultiplier = Math.max(1, Number(multiplier) || 1);
    const minutes = Number(durationMinutes) || 0;
    const durationMs = minutes > 0 ? minutes * 60 * 1000 : null;

    const event = {
        active: true,
        multiplier: safeMultiplier,
        startedAt: now,
        endsAt: durationMs ? now + durationMs : null,
        startedBy: startedBy ? String(startedBy) : null,
    };

    await setInDb(EVENT_KEY, event);
    logger.info('[EVENT] Global fishing event started', {
        multiplier: safeMultiplier,
        durationMinutes: minutes,
        startedBy: event.startedBy,
    });

    return event;
}

// Hentikan event global.
export async function stopFishingEvent() {
    await deleteFromDb(EVENT_KEY);
    logger.info('[EVENT] Global fishing event stopped');
}

// Multiplier luck yang harus dipakai /fish dan /netting (1 kalau tidak ada event).
export async function getActiveFishingLuckMultiplier() {
    const event = await getFishingEvent();
    if (!event) {
        return 1;
    }

    const multiplier = Number(event.multiplier) || 1;
    return multiplier > 1 ? multiplier : 1;
}

// ===== Channel pengumuman per-server =====
// Tiap server set channel-nya sendiri lewat /fishevent setchannel.

export async function setFishingEventChannel(guildId, channelId) {
    await setInDb(getFishingEventChannelKey(guildId), {
        announcementChannelId: String(channelId),
    });
    logger.info('[EVENT] Announcement channel set', { guildId, channelId });
}

export async function clearFishingEventChannel(guildId) {
    await deleteFromDb(getFishingEventChannelKey(guildId));
    logger.info('[EVENT] Announcement channel cleared', { guildId });
}

export async function getFishingEventChannel(guildId) {
    const config = await getFromDb(getFishingEventChannelKey(guildId), null);
    return config?.announcementChannelId || null;
}

function formatRemaining(endsAt) {
    if (!endsAt) {
        return 'sampai dihentikan manual';
    }

    const remainingMs = Math.max(0, endsAt - Date.now());
    const totalMinutes = Math.ceil(remainingMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

// Kirim pengumuman event ke channel yang sudah di-set di tiap server.
// Server yang belum set channel / tanpa izin akan dilewati, bukan bikin gagal semua.
export async function broadcastFishingEvent(client, event, { action = 'start' } = {}) {
    const result = { sent: 0, skipped: 0, failed: 0 };

    if (!client?.guilds?.cache) {
        return result;
    }

    const embed = action === 'stop'
        ? createEmbed({
            title: 'Fishing Event Ended',
            description: `The global **x${event.multiplier}** luck boost has ended.`,
            color: '#ED4245',
        })
        : createEmbed({
            title: 'Fishing Event Started',
            description:
                `Global fishing luck boost **x${event.multiplier}** is now active in every server!\n` +
                `Duration: **${formatRemaining(event.endsAt)}**.`,
            color: '#F1C40F',
        });

    for (const guild of client.guilds.cache.values()) {
        try {
            const channelId = await getFishingEventChannel(guild.id);
            if (!channelId) {
                result.skipped++;
                continue;
            }

            const channel = guild.channels.cache.get(channelId)
                || await guild.channels.fetch(channelId).catch(() => null);

            if (!channel?.isTextBased?.()) {
                result.skipped++;
                continue;
            }

            await channel.send({ embeds: [embed] });
            result.sent++;
        } catch (error) {
            result.failed++;
            logger.warn(`[EVENT] Failed to announce in guild ${guild.id}: ${error.message}`);
        }
    }

    logger.info('[EVENT] Broadcast finished', result);
    return result;
}
