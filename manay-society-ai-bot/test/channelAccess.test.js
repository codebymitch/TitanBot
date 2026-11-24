import test from 'node:test';
import assert from 'node:assert/strict';
import { requestChatCompletion, requestImage } from '../ai/client.js';
import { assertRequiredEnv } from '../config/env.js';
import { formatAiError, isChannelAllowed } from '../ai/service.js';

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

test('startup does not require an AI provider API key', () => {
  const env = {
    discordToken: 'discord-token',
    clientId: 'application-id',
    mongoUri: 'mongodb://localhost/manay',
  };
  assert.equal(assertRequiredEnv(env), env);
});

test('free provider cooldown errors tell users when to retry', () => {
  assert.match(formatAiError({ status: 402, retryAfterSeconds: 45 }), /45 detik/);
});

test('anonymous chat request sends no API authorization header', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'Halo!' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const result = await requestChatCompletion({
      model: 'openai-fast',
      messages: [{ role: 'user', content: 'Hai' }],
    });
    assert.equal(request.url, 'https://text.pollinations.ai/openai');
    assert.equal(request.options.headers.Authorization, undefined);
    assert.equal(result.choices[0].message.content, 'Halo!');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('anonymous image request downloads an image without API credentials', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl;
  globalThis.fetch = async (url) => {
    requestUrl = new URL(url);
    return new Response(Buffer.from('fake-jpeg'), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    });
  };

  try {
    const image = await requestImage('a small blue bird');
    assert.match(requestUrl.hostname, /pollinations\.ai$/);
    assert.equal(requestUrl.searchParams.get('safe'), 'true');
    assert.equal(image.toString(), 'fake-jpeg');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
