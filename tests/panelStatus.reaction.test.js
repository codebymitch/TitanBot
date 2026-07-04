import test from 'node:test';
import assert from 'node:assert/strict';

import {
    messageHasSelectMenuCustomId,
    formatPanelStatusField,
    getReactionRolePanelStatus,
} from '../src/utils/panelStatus.js';

test('messageHasSelectMenuCustomId finds select menu custom_id', () => {
    const message = {
        components: [
            {
                type: 1,
                components: [{ type: 3, custom_id: 'reaction_roles', options: [] }],
            },
        ],
    };

    assert.equal(messageHasSelectMenuCustomId(message, 'reaction_roles'), true);
    assert.equal(messageHasSelectMenuCustomId(message, 'other'), false);
});

test('formatPanelStatusField describes deleted panels with repost hint', () => {
    const value = formatPanelStatusField({ exists: false, reason: 'panel_deleted' });
    assert.match(value, /Repost Panel/);
});

test('getReactionRolePanelStatus scans for reaction_roles select menu', async () => {
    const panelMessage = {
        id: 'msg-rr',
        author: { id: 'bot' },
        components: [{ type: 1, components: [{ type: 3, custom_id: 'reaction_roles' }] }],
    };

    const client = { user: { id: 'bot' } };
    const guild = {
        id: 'g1',
        channels: {
            fetch: async () => ({
                messages: {
                    fetch: async () => new Map([['msg-rr', panelMessage]]),
                },
            }),
        },
    };

    const status = await getReactionRolePanelStatus(client, guild, {
        channelId: 'ch1',
        messageId: 'stale',
    });

    assert.equal(status.exists, true);
    assert.equal(status.recoveredId, 'msg-rr');
});
