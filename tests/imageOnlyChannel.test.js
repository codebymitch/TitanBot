import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { handleImageOnlyChannelMessage, IMAGE_ONLY_CHANNEL_ID } from '../src/services/imageOnlyChannelService.js';

function makeMessage({ channelId = IMAGE_ONLY_CHANNEL_ID, attachments = [], authorId = 'member' } = {}) {
  const state = { deleted: false };
  const message = {
    channelId,
    content: 'hello',
    attachments: new Map(attachments.map((attachment, index) => [String(index), attachment])),
    author: { id: authorId, bot: false },
    guild: {
      id: 'g',
      ownerId: 'owner',
      client: {
        user: { id: 'bot' },
      },
      members: { fetch: async () => null },
    },
    delete: async () => { state.deleted = true; },
    channel: { send: async () => null },
  };
  return { message, state };
}

describe('image-only channel', () => {
  test('deletes a text-only message', async () => {
    const { message, state } = makeMessage();
    assert.equal(await handleImageOnlyChannelMessage(message), true);
    assert.equal(state.deleted, true);
  });

  test('keeps an image with text', async () => {
    const { message, state } = makeMessage({ attachments: [{ name: 'a.png', contentType: 'image/png' }] });
    assert.equal(await handleImageOnlyChannelMessage(message), false);
    assert.equal(state.deleted, false);
  });

  test('deletes a message whose only attachment is not an image', async () => {
    const { message, state } = makeMessage({ attachments: [{ name: 'notes.txt', contentType: 'text/plain' }] });
    assert.equal(await handleImageOnlyChannelMessage(message), true);
    assert.equal(state.deleted, true);
  });

  test('lets the server owner write without an image', async () => {
    const { message, state } = makeMessage({ authorId: 'owner' });
    assert.equal(await handleImageOnlyChannelMessage(message), false);
    assert.equal(state.deleted, false);
  });

  test('ignores other channels', async () => {
    const { message, state } = makeMessage({ channelId: 'other' });
    assert.equal(await handleImageOnlyChannelMessage(message), false);
    assert.equal(state.deleted, false);
  });
});
