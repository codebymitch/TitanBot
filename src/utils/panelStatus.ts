/**
 * Shared helpers for detecting bot-posted panel messages (tickets, verification, etc.)
 */

import type { Guild, GuildTextBasedChannel, Message } from 'discord.js';
import type { NexoClient } from '../types/index.js';

/** Raw component JSON fields inspected while walking a message's components. */
interface ComponentJsonLike {
    type?: number;
    custom_id?: string;
    components?: readonly ComponentLike[];
}

/** A discord.js component (with toJSON) or its raw JSON. */
interface ComponentLike extends ComponentJsonLike {
    toJSON?(): ComponentJsonLike;
}

type PanelMessage = Pick<Message, 'components'> | null | undefined;

export interface PanelMarker {
    buttonCustomId?: string | null;
    selectCustomId?: string | null;
}

export type PanelMissingReason = 'no_channel' | 'channel_missing' | 'panel_deleted';

export interface PanelStatus {
    exists: boolean;
    reason?: PanelMissingReason;
    message?: Message;
    channel?: GuildTextBasedChannel;
    recoveredId?: string;
}

export interface BotPanelStatusOptions extends PanelMarker {
    channelId?: string | null;
    messageId?: string | null;
    scanLimit?: number;
}

export function messageHasButtonCustomId(message: PanelMessage, buttonCustomId: string | null | undefined): boolean {
    if (!message?.components?.length || !buttonCustomId) return false;

    const walk = (components: readonly ComponentLike[]): boolean => {
        for (const component of components) {
            const json = typeof component.toJSON === 'function' ? component.toJSON() : component;
            if (!json) continue;
            if (json.type === 2 && json.custom_id === buttonCustomId) return true;
            if (Array.isArray(json.components) && walk(json.components)) return true;
        }
        return false;
    };

    const rows: ComponentLike[] = [...(message.components.values?.() || message.components)];
    return walk(rows);
}

export function messageHasSelectMenuCustomId(message: PanelMessage, selectCustomId: string | null | undefined): boolean {
    if (!message?.components?.length || !selectCustomId) return false;

    const walk = (components: readonly ComponentLike[]): boolean => {
        for (const component of components) {
            const json = typeof component.toJSON === 'function' ? component.toJSON() : component;
            if (!json) continue;
            if (json.type === 3 && json.custom_id === selectCustomId) return true;
            if (Array.isArray(json.components) && walk(json.components)) return true;
        }
        return false;
    };

    const rows: ComponentLike[] = [...(message.components.values?.() || message.components)];
    return walk(rows);
}

export function messageHasPanelMarker(message: PanelMessage, { buttonCustomId, selectCustomId }: PanelMarker = {}): boolean {
    if (buttonCustomId && messageHasButtonCustomId(message, buttonCustomId)) return true;
    if (selectCustomId && messageHasSelectMenuCustomId(message, selectCustomId)) return true;
    return false;
}

export function formatPanelStatusField(
    panelStatus: PanelStatus | null | undefined,
    { repostHint = 'Panel neu posten' }: { repostHint?: string } = {},
): string {
    if (!panelStatus) return '`Unbekannt`';

    if (panelStatus.exists) {
        return panelStatus.message?.url
            ? `✅ Aktiv — [Panel ansehen](${panelStatus.message.url})`
            : '✅ Aktiv';
    }

    if (panelStatus.reason === 'channel_missing') {
        return '⚠️ Panel-Kanal fehlt oder wurde gelöscht';
    }

    if (panelStatus.reason === 'panel_deleted') {
        return `⚠️ Panel-Nachricht wurde gelöscht — nutze unten **${repostHint}**`;
    }

    if (panelStatus.reason === 'no_channel') {
        return '⚠️ Kein Panel-Kanal konfiguriert';
    }

    return '`Unbekannt`';
}

export async function getBotPanelStatus(client: NexoClient, guild: Guild, {
    channelId,
    messageId = null,
    buttonCustomId = null,
    selectCustomId = null,
    scanLimit = 50,
}: BotPanelStatusOptions = {}): Promise<PanelStatus> {
    if (!channelId) {
        return { exists: false, reason: 'no_channel' };
    }

    if (!buttonCustomId && !selectCustomId) {
        return { exists: false, reason: 'no_channel' };
    }

    // Panel channels are text channels (as the JS assumed).
    const channel = await guild.channels.fetch(channelId).catch(() => null) as GuildTextBasedChannel | null;
    if (!channel) {
        return { exists: false, reason: 'channel_missing' };
    }

    const marker = { buttonCustomId, selectCustomId };

    if (messageId) {
        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (message && messageHasPanelMarker(message, marker)) {
            return { exists: true, message, channel };
        }
    }

    const messages = await channel.messages.fetch({ limit: scanLimit }).catch(() => null);
    const messageList: Message[] = messages
        ? [...messages.values()]
        : [];
    const recovered = messageList.find(
        (entry) => entry.author.id === client.user.id && messageHasPanelMarker(entry, marker),
    );

    if (recovered) {
        return { exists: true, message: recovered, channel, recoveredId: recovered.id };
    }

    return { exists: false, reason: 'panel_deleted', channel };
}

/** Guild config fields read for the ticket panel. */
interface TicketPanelConfig {
    ticketPanelChannelId?: string | null;
    ticketPanelMessageId?: string | null;
}

/** Stored location of a verification or reaction-role panel. */
interface PanelLocation {
    channelId?: string | null;
    messageId?: string | null;
}

export async function getTicketPanelStatus(client: NexoClient, guild: Guild, config: TicketPanelConfig): Promise<PanelStatus> {
    return getBotPanelStatus(client, guild, {
        channelId: config.ticketPanelChannelId,
        messageId: config.ticketPanelMessageId,
        buttonCustomId: 'create_ticket',
    });
}

export async function getVerificationPanelStatus(
    client: NexoClient,
    guild: Guild,
    config: PanelLocation | null | undefined,
): Promise<PanelStatus> {
    return getBotPanelStatus(client, guild, {
        channelId: config?.channelId,
        messageId: config?.messageId,
        buttonCustomId: 'verify_user',
    });
}

export async function getReactionRolePanelStatus(
    client: NexoClient,
    guild: Guild,
    panelData: PanelLocation | null | undefined,
): Promise<PanelStatus> {
    return getBotPanelStatus(client, guild, {
        channelId: panelData?.channelId,
        messageId: panelData?.messageId,
        selectCustomId: 'reaction_roles',
    });
}
