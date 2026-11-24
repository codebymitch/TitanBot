import { getEnv } from '../config/env.js';

const TEXT_ENDPOINT = 'https://text.pollinations.ai/openai';
const IMAGE_ENDPOINT = 'https://image.pollinations.ai/prompt';

export async function requestChatCompletion({ model, messages }) {
  const env = getEnv();
  const response = await fetch(TEXT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 1200,
      temperature: 0.7,
      stream: false,
    }),
    signal: AbortSignal.timeout(env.providerTimeoutMs),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw createProviderError(response, payload);
  }
  return payload;
}

export async function requestImage(prompt) {
  const env = getEnv();
  const url = new URL(`${IMAGE_ENDPOINT}/${encodeURIComponent(prompt)}`);
  url.searchParams.set('width', '768');
  url.searchParams.set('height', '768');
  url.searchParams.set('safe', 'true');

  const response = await fetch(url, {
    signal: AbortSignal.timeout(env.providerTimeoutMs),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw createProviderError(response, detail);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    throw new Error('Free image service did not return an image.');
  }

  const image = Buffer.from(await response.arrayBuffer());
  if (image.length > 8 * 1024 * 1024) {
    throw new Error('Generated image is too large to upload to Discord.');
  }
  return image;
}

function createProviderError(response, payload) {
  const detail = typeof payload === 'string'
    ? payload
    : payload?.error?.message || payload?.message || '';
  const error = new Error(`Free AI service returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
  error.status = response.status;
  error.retryAfterSeconds = Number.parseInt(response.headers.get('retry-after') || '', 10) || null;
  return error;
}
