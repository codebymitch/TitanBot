import test from 'node:test';
import assert from 'node:assert/strict';

import {
    messageHasButtonCustomId,
    getBotPanelStatus,
    getTicketPanelStatus,
} from '../src/utils/panelStatus.js';

test('messageHasButtonCustomId finds nested button custom_id', () => {
    const message = {
        components: [
            {
                type: 1,
                components: [{ type: 2, custom_id: 'create_ticket', style: 1, label: 'Create' }],
            },
        ],
    };

    assert.equal(messageHasButtonCustomId(message, 'create_ticket'), true);
    assert.equal(messageHasButtonCustomId(message, 'other'), false);
});

test('messageHasButtonCustomId returns false for empty input', () => {
    assert.equal(messageHasButtonCustomId(null, 'create_ticket'), false);
    assert.equal(messageHasButtonCustomId({ components: [] }, ''), false);
});

test('getBotPanelStatus returns no_channel when channelId missing', async () => {
    const client = { user: { id: 'bot' } };
    const guild = { id: 'g1' };

    const status = await getBotPanelStatus(client, guild, { buttonCustomId: 'create_ticket' });
    assert.deepEqual(status, { exists: false, reason: 'no_channel' });
});

test('getBotPanelStatus returns channel_missing when fetch fails', async () => {
    const client = { user: { id: 'bot' } };
    const guild = {
        id: 'g1',
        channels: {
            fetch: async () => null,
        },
    };

    const status = await getBotPanelStatus(client, guild, {
        channelId: 'missing',
        buttonCustomId: 'create_ticket',
    });
    assert.equal(status.exists, false);
    assert.equal(status.reason, 'channel_missing');
});

test('getBotPanelStatus returns active when stored message has button', async () => {
    const panelMessage = {
        id: 'msg1',
        url: 'https://discord.com/channels/1/2/3',
        components: [{ type: 1, components: [{ type: 2, custom_id: 'create_ticket' }] }],
    };

    const client = { user: { id: 'bot' } };
    const guild = {
        id: 'g1',
        channels: {
            fetch: async () => ({
                messages: {
                    fetch: async (idOrOpts) => {
                        if (idOrOpts === 'msg1') return panelMessage;
                        return null;
                    },
                },
            }),
        },
    };

    const status = await getBotPanelStatus(client, guild, {
        channelId: 'ch1',
        messageId: 'msg1',
        buttonCustomId: 'create_ticket',
    });

    assert.equal(status.exists, true);
    assert.equal(status.message.id, 'msg1');
});

test('getBotPanelStatus scans channel when messageId missing or stale', async () => {
    const recovered = {
        id: 'recovered',
        author: { id: 'bot' },
        components: [{ type: 1, components: [{ type: 2, custom_id: 'create_ticket' }] }],
    };

    const client = { user: { id: 'bot' } };
    const guild = {
        id: 'g1',
        channels: {
            fetch: async () => ({
                messages: {
                    fetch: async (idOrOpts) => {
                        if (typeof idOrOpts === 'string') return null;
                        return new Map([['recovered', recovered]]);
                    },
                },
            }),
        },
    };

    const status = await getBotPanelStatus(client, guild, {
        channelId: 'ch1',
        messageId: 'stale',
        buttonCustomId: 'create_ticket',
    });

    assert.equal(status.exists, true);
    assert.equal(status.recoveredId, 'recovered');
});

test('getTicketPanelStatus delegates to ticket config fields', async () => {
    let captured = null;
    const client = {
        user: { id: 'bot' },
    };
    const guild = {
        id: 'g1',
        channels: {
            fetch: async (channelId) => {
                captured = channelId;
                return {
                    messages: {
                        fetch: async () => new Map(),
                    },
                };
            },
        },
    };

    const status = await getTicketPanelStatus(client, guild, {
        ticketPanelChannelId: 'panel-ch',
        ticketPanelMessageId: null,
    });

    assert.equal(captured, 'panel-ch');
    assert.equal(status.reason, 'panel_deleted');
});
