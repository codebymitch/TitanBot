import OpenAI from 'openai';
import { getEnv } from '../config/env.js';

let client;

export function getOpenAI() {
  if (!client) {
    const env = getEnv();
    client = new OpenAI({
      apiKey: env.openAiApiKey,
      timeout: env.openAiTimeoutMs,
      maxRetries: 2,
    });
  }
  return client;
}
