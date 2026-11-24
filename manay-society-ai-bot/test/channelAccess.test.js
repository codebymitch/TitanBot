import test from 'node:test';
import assert from 'node:assert/strict';
import { isChannelAllowed } from '../ai/service.js';

test('AI remains unavailable when the guild setting is disabled', () => {
  assert.equal(isChannelAllowed({
    enabled: false,
    allChannels: true,
    disabledChannelIds: [],
    channelIds: ['channel-1'],
  }, 'channel-1'), false);
});

test('allowlist mode permits only configured channels', () => {
  const config = {
    enabled: true,
    allChannels: false,
    channelIds: ['channel-1'],
    disabledChannelIds: [],
  };
  assert.equal(isChannelAllowed(config, 'channel-1'), true);
  assert.equal(isChannelAllowed(config, 'channel-2'), false);
});

test('all-channel mode respects explicit exclusions', () => {
  const config = {
    enabled: true,
    allChannels: true,
    channelIds: [],
    disabledChannelIds: ['channel-2'],
  };
  assert.equal(isChannelAllowed(config, 'channel-1'), true);
  assert.equal(isChannelAllowed(config, 'channel-2'), false);
});
