// fishingEventService.js
// Event mancing global (lintas server). Disimpan sebagai satu flag di DB
// (key non-guild), lalu dibaca oleh /fish dan /netting sehingga boost luck
// otomatis berlaku di semua server tanpa menulis inventory siapa pun.

import { getFromDb, setInDb, deleteFromDb } from '../utils/database.js';
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
