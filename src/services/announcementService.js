// announcementService.js
// Pengumuman lintas server (owner) + channel pengumuman per-server.
// Channel pengumuman disimpan per-server lewat /owner pengumuman setchannel,
// lalu dipakai untuk menyiarkan pengumuman ke setiap server.

import { getFromDb, setInDb, deleteFromDb, getAnnouncementChannelKey } from '../utils/database.js';
import { logger } from '../utils/logger.js';

// ===== Channel pengumuman per-server =====

export async function setAnnouncementChannel(guildId, channelId) {
    await setInDb(getAnnouncementChannelKey(guildId), {
        announcementChannelId: String(channelId),
    });
    logger.info('[ANNOUNCE] Announcement channel set', { guildId, channelId });
}

export async function clearAnnouncementChannel(guildId) {
    await deleteFromDb(getAnnouncementChannelKey(guildId));
    logger.info('[ANNOUNCE] Announcement channel cleared', { guildId });
}

export async function getAnnouncementChannel(guildId) {
    const config = await getFromDb(getAnnouncementChannelKey(guildId), null);
    return config?.announcementChannelId || null;
}

// Kirim embed ke channel pengumuman yang sudah di-set di tiap server.
// Server yang belum set channel / tanpa izin akan dilewati, bukan bikin gagal semua.
async function sendToAnnouncementChannels(client, embed, tag) {
    const result = { sent: 0, skipped: 0, failed: 0 };

    if (!client?.guilds?.cache) {
        return result;
    }

    for (const guild of client.guilds.cache.values()) {
        try {
            const channelId = await getAnnouncementChannel(guild.id);
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
            logger.warn(`[${tag}] Failed to announce in guild ${guild.id}: ${error.message}`);
        }
    }

    logger.info(`[${tag}] Broadcast finished`, result);
    return result;
}

// Pengumuman bebas (owner) ke channel pengumuman semua server.
export async function broadcastAnnouncement(client, embed) {
    return sendToAnnouncementChannels(client, embed, 'ANNOUNCE');
}
