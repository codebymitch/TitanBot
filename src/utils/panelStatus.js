/**
 * Shared helpers for detecting bot-posted panel messages (tickets, verification, etc.)
 */

export function messageHasButtonCustomId(message, buttonCustomId) {
    if (!message?.components?.length || !buttonCustomId) return false;

    const walk = (components) => {
        for (const component of components) {
            const json = typeof component.toJSON === 'function' ? component.toJSON() : component;
            if (!json) continue;
            if (json.type === 2 && json.custom_id === buttonCustomId) return true;
            if (Array.isArray(json.components) && walk(json.components)) return true;
        }
        return false;
    };

    const rows = [...(message.components.values?.() || message.components)];
    return walk(rows);
}

export function messageHasSelectMenuCustomId(message, selectCustomId) {
    if (!message?.components?.length || !selectCustomId) return false;

    const walk = (components) => {
        for (const component of components) {
            const json = typeof component.toJSON === 'function' ? component.toJSON() : component;
            if (!json) continue;
            if (json.type === 3 && json.custom_id === selectCustomId) return true;
            if (Array.isArray(json.components) && walk(json.components)) return true;
        }
        return false;
    };

    const rows = [...(message.components.values?.() || message.components)];
    return walk(rows);
}

export function messageHasPanelMarker(message, { buttonCustomId, selectCustomId } = {}) {
    if (buttonCustomId && messageHasButtonCustomId(message, buttonCustomId)) return true;
    if (selectCustomId && messageHasSelectMenuCustomId(message, selectCustomId)) return true;
    return false;
}

export function formatPanelStatusField(panelStatus, { repostHint = 'Repost Panel' } = {}) {
    if (!panelStatus) return '`Unknown`';

    if (panelStatus.exists) {
        return panelStatus.message?.url
            ? `✅ Active — [view panel](${panelStatus.message.url})`
            : '✅ Active';
    }

    if (panelStatus.reason === 'channel_missing') {
        return '⚠️ Panel channel missing or deleted';
    }

    if (panelStatus.reason === 'panel_deleted') {
        return `⚠️ Panel message was deleted — use **${repostHint}** below`;
    }

    if (panelStatus.reason === 'no_channel') {
        return '⚠️ No panel channel configured';
    }

    return '`Unknown`';
}

export async function getBotPanelStatus(client, guild, {
    channelId,
    messageId = null,
    buttonCustomId = null,
    selectCustomId = null,
    scanLimit = 50,
} = {}) {
    if (!channelId) {
        return { exists: false, reason: 'no_channel' };
    }

    if (!buttonCustomId && !selectCustomId) {
        return { exists: false, reason: 'no_channel' };
    }

    const channel = await guild.channels.fetch(channelId).catch(() => null);
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
    const messageList = messages
        ? [...(typeof messages.values === 'function' ? messages.values() : messages)]
        : [];
    const recovered = messageList.find(
        (entry) => entry.author.id === client.user.id && messageHasPanelMarker(entry, marker),
    );

    if (recovered) {
        return { exists: true, message: recovered, channel, recoveredId: recovered.id };
    }

    return { exists: false, reason: 'panel_deleted', channel };
}

export async function getTicketPanelStatus(client, guild, config) {
    return getBotPanelStatus(client, guild, {
        channelId: config.ticketPanelChannelId,
        messageId: config.ticketPanelMessageId,
        buttonCustomId: 'create_ticket',
    });
}

export async function getVerificationPanelStatus(client, guild, config) {
    return getBotPanelStatus(client, guild, {
        channelId: config?.channelId,
        messageId: config?.messageId,
        buttonCustomId: 'verify_user',
    });
}

export async function getReactionRolePanelStatus(client, guild, panelData) {
    return getBotPanelStatus(client, guild, {
        channelId: panelData?.channelId,
        messageId: panelData?.messageId,
        selectCustomId: 'reaction_roles',
    });
}

