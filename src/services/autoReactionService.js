import { logger } from '../utils/logger.js';
import { getFromDb, setInDb, deleteFromDb } from '../utils/database.js';

const AUTO_REACTION_PREFIX = 'autoReactions';
const MAX_RULES_PER_GUILD = 50;
const MAX_EMOJIS_PER_RULE = 5;
const MAX_KEYWORD_LENGTH = 100;

const DEFAULT_STATE = { nextId: 1, rules: [] };

function getStateKey(guildId) {
  return `${AUTO_REACTION_PREFIX}:${guildId}`;
}

function normalizeEmojis(emojis) {
  if (!Array.isArray(emojis)) {
    return [];
  }

  return emojis
    .map((emoji) => String(emoji || '').trim())
    .filter((emoji) => emoji.length > 0)
    .slice(0, MAX_EMOJIS_PER_RULE);
}

function normalizeRule(rule) {
  if (!rule || typeof rule !== 'object') {
    return null;
  }

  const emojis = normalizeEmojis(rule.emojis);
  if (emojis.length === 0) {
    return null;
  }

  return {
    id: String(rule.id),
    emojis,
    channelId: rule.channelId || null,
    keyword: typeof rule.keyword === 'string' && rule.keyword.length > 0 ? rule.keyword : null,
    enabled: rule.enabled !== false,
    createdAt: rule.createdAt || null,
  };
}

async function getState(guildId) {
  const raw = await getFromDb(getStateKey(guildId), null);
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_STATE, rules: [] };
  }

  const rules = Array.isArray(raw.rules)
    ? raw.rules.map(normalizeRule).filter(Boolean)
    : [];
  const nextId = Number.isInteger(raw.nextId) && raw.nextId > 0 ? raw.nextId : rules.length + 1;

  return { nextId, rules };
}

async function saveState(guildId, state) {
  await setInDb(getStateKey(guildId), state);
  return state;
}

export async function getRules(_client, guildId) {
  return (await getState(guildId)).rules;
}

export async function getRule(_client, guildId, id) {
  const rules = await getRules(_client, guildId);
  return rules.find((rule) => rule.id === String(id)) || null;
}

export async function addRule(guildId, { emojis, channelId = null, keyword = null }) {
  const normalizedEmojis = normalizeEmojis(emojis);
  if (normalizedEmojis.length === 0) {
    throw new Error('At least one emoji is required.');
  }

  const state = await getState(guildId);
  if (state.rules.length >= MAX_RULES_PER_GUILD) {
    throw new Error(`This server already has the maximum of ${MAX_RULES_PER_GUILD} auto reaction rules.`);
  }

  const rule = {
    id: String(state.nextId),
    emojis: normalizedEmojis,
    channelId,
    keyword: keyword ? String(keyword).trim().slice(0, MAX_KEYWORD_LENGTH) || null : null,
    enabled: true,
    createdAt: new Date().toISOString(),
  };

  state.rules.push(rule);
  state.nextId += 1;
  await saveState(guildId, state);
  return rule;
}

export async function removeRule(guildId, id) {
  const state = await getState(guildId);
  const nextRules = state.rules.filter((rule) => rule.id !== String(id));
  if (nextRules.length === state.rules.length) {
    return false;
  }

  state.rules = nextRules;
  await saveState(guildId, state);
  return true;
}

export async function setRuleEnabled(guildId, id, enabled) {
  const state = await getState(guildId);
  const rule = state.rules.find((entry) => entry.id === String(id));
  if (!rule) {
    return null;
  }

  rule.enabled = enabled !== false;
  await saveState(guildId, state);
  return rule;
}

export async function clearRules(guildId) {
  await deleteFromDb(getStateKey(guildId));
}

export function ruleMatchesMessage(rule, message) {
  if (!rule.enabled) {
    return false;
  }

  if (rule.channelId && rule.channelId !== message.channel.id) {
    return false;
  }

  if (rule.keyword) {
    const content = (message.content || '').toLowerCase();
    if (!content.includes(rule.keyword.toLowerCase())) {
      return false;
    }
  }

  return true;
}

export async function handleAutoReaction(message, client) {
  try {
    const rules = await getRules(client, message.guild.id);
    if (rules.length === 0) {
      return;
    }

    for (const rule of rules) {
      if (!ruleMatchesMessage(rule, message)) {
        continue;
      }

      for (const emoji of rule.emojis) {
        await message.react(emoji).catch(() => {});
      }
    }
  } catch (error) {
    logger.error('Error handling auto reaction:', error);
  }
}
