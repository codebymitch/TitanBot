import { AsyncLocalStorage } from 'async_hooks';
import crypto from 'crypto';

const traceStorage = new AsyncLocalStorage();

function sanitizeCommandName(interaction) {
  if (interaction?.isChatInputCommand?.() && interaction.commandName) {
    return interaction.commandName;
  }

  if (interaction?.isButton?.() || interaction?.isModalSubmit?.() || interaction?.isStringSelectMenu?.()) {
    return interaction.customId || null;
  }

  return null;
}

export function createTraceId(prefix = 'trc') {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

export function createInteractionTraceContext(interaction, overrides = {}) {
  return {
    traceId: createTraceId(),
    interactionId: interaction?.id || null,
    interactionType: interaction?.type || null,
    guildId: interaction?.guildId || null,
    channelId: interaction?.channelId || null,
    userId: interaction?.user?.id || null,
    command: sanitizeCommandName(interaction),
    ...overrides
  };
}

export function runWithTraceContext(traceContext, callback) {
  return traceStorage.run(traceContext, callback);
}

export function getTraceContext() {
  return traceStorage.getStore() || null;
}

export function getTraceId() {
  return getTraceContext()?.traceId || null;
}
