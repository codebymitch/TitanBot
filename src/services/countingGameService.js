import { logger } from '../utils/logger.js';

const COUNTING_GAME_KEY_PREFIX = 'countingGame:';

const COUNTING_SYSTEMS = {
  decimal: {
    label: 'Decimal',
    description: 'Standard 10-number system using 0-9',
    toString: (n) => n.toString(10),
    parse: (value) => {
      if (!/^[0-9]+$/.test(value)) return null;
      return Number(value);
    },
  },
  hexadecimal: {
    label: 'Hexadecimal',
    description: '16-number system using 0-9 and A-F',
    toString: (n) => n.toString(16).toUpperCase(),
    parse: (value) => {
      if (!/^[0-9A-Fa-f]+$/.test(value)) return null;
      return parseInt(value, 16);
    },
  },
  binary: {
    label: 'Binary',
    description: '2-number system using 0-1',
    toString: (n) => n.toString(2),
    parse: (value) => {
      if (!/^[01]+$/.test(value)) return null;
      return parseInt(value, 2);
    },
  },
  base36: {
    label: 'Base36',
    description: '36-number system using 0-9 and A-Z',
    toString: (n) => n.toString(36).toUpperCase(),
    parse: (value) => {
      if (!/^[0-9A-Za-z]+$/.test(value)) return null;
      return parseInt(value, 36);
    },
  },
  base64: {
    label: 'Base64',
    description: '64-number system using A-Z, a-z, 0-9, +, /',
    alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
    toString: (n) => {
      if (n === 0) return 'A';
      const alphabet = COUNTING_SYSTEMS.base64.alphabet;
      let value = n;
      let result = '';
      while (value > 0) {
        const remainder = value % 64;
        result = alphabet[remainder] + result;
        value = Math.floor(value / 64);
      }
      return result;
    },
    parse: (value) => {
      const alphabet = COUNTING_SYSTEMS.base64.alphabet;
      const normalized = value.replace(/=+$/, '');
      if (!/^[A-Za-z0-9+/]+$/.test(normalized)) {
        return null;
      }
      let result = 0;
      for (const char of normalized) {
        const index = alphabet.indexOf(char);
        if (index === -1) return null;
        result = result * 64 + index;
      }
      return result;
    },
  },
  roman: {
    label: 'Roman',
    description: 'Roman numerals like I, II, III, IV, V',
    toString: (n) => {
      const romanNumerals = [
        ['M', 1000], ['CM', 900], ['D', 500], ['CD', 400],
        ['C', 100], ['XC', 90], ['L', 50], ['XL', 40],
        ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1],
      ];
      let num = n;
      let result = '';
      for (const [roman, value] of romanNumerals) {
        while (num >= value) {
          result += roman;
          num -= value;
        }
      }
      return result;
    },
    parse: (value) => {
      const roman = value.toUpperCase();
      if (!/^[IVXLCDM]+$/.test(roman)) return null;
      const romanValues = {
        I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000,
      };
      let total = 0;
      let prev = 0;
      for (let i = roman.length - 1; i >= 0; i--) {
        const current = romanValues[roman[i]];
        if (!current) return null;
        if (current < prev) {
          total -= current;
        } else {
          total += current;
          prev = current;
        }
      }
      return total;
    },
  },
  math: {
    label: 'Math Expressions',
    description: 'Use a math expression that equals the next number, like 4*4=16',
    toString: (n) => `${n}`,
    parse: (value) => {
      const expression = value.replace(/\s+/g, '');
      if (expression.length === 0) return null;
      const sanitized = expression.replace(/\^/g, '**');
      if (!/^[0-9+\-*/().=**]+$/.test(sanitized)) return null;
      const parts = sanitized.split('=');
      try {
        const evaluate = (expr) => {
          if (!expr || /[^0-9+\-*/().]/.test(expr)) return null;
          // eslint-disable-next-line no-new-func
          return Function(`"use strict"; return (${expr});`)();
        };

        if (parts.length === 1) {
          return Number(evaluate(parts[0]));
        }
        if (parts.length === 2) {
          const left = evaluate(parts[0]);
          const right = evaluate(parts[1]);
          if (left === right) {
            return Number(left);
          }
          return null;
        }
      } catch {
        return null;
      }
      return null;
    },
  },
  alphabet: {
    label: 'Alphabet',
    description: 'Letters A-Z in sequence',
    toString: (n) => {
      let num = n;
      let result = '';
      while (num > 0) {
        num -= 1;
        result = String.fromCharCode(65 + (num % 26)) + result;
        num = Math.floor(num / 26);
      }
      return result;
    },
    parse: (value) => {
      const letters = value.toUpperCase();
      if (!/^[A-Z]+$/.test(letters)) return null;
      let result = 0;
      for (const char of letters) {
        result = result * 26 + (char.charCodeAt(0) - 64);
      }
      return result;
    },
  },
};

const DEFAULT_COUNTING_GAME = {
  enabled: false,
  channelId: null,
  system: 'decimal',
  nextNumber: 1,
  lastUserId: null,
  currentStreak: 0,
  bestStreak: 0,
  leaderboard: {},
};

function normalizeCountingGame(state) {
  const normalized = {
    ...DEFAULT_COUNTING_GAME,
    ...(state || {}),
  };

  normalized.system = COUNTING_SYSTEMS[normalized.system] ? normalized.system : 'decimal';
  normalized.leaderboard = normalized.leaderboard && typeof normalized.leaderboard === 'object'
    ? { ...normalized.leaderboard }
    : {};

  return normalized;
}

function getStorageKey(guildId) {
  return `${COUNTING_GAME_KEY_PREFIX}${guildId}`;
}

export async function getCountingGameConfig(client, guildId) {
  try {
    const rawState = await client.db.get(getStorageKey(guildId));
    return normalizeCountingGame(rawState);
  } catch (error) {
    logger.error('Failed to load counting game config:', { guildId, error });
    return normalizeCountingGame();
  }
}

export async function saveCountingGameConfig(client, guildId, state) {
  const normalized = normalizeCountingGame(state);
  await client.db.set(getStorageKey(guildId), normalized);
  return normalized;
}

export async function disableCountingGame(client, guildId) {
  const config = await getCountingGameConfig(client, guildId);
  return saveCountingGameConfig(client, guildId, { ...config, enabled: false });
}

export async function resetCountingGame(client, guildId, startNumber = 1) {
  const config = await getCountingGameConfig(client, guildId);
  return saveCountingGameConfig(client, guildId, {
    ...config,
    nextNumber: startNumber,
    lastUserId: null,
    currentStreak: 0,
  });
}

export async function recordCorrectCount(client, guildId, userId) {
  const config = await getCountingGameConfig(client, guildId);
  const leaderboard = { ...config.leaderboard };
  leaderboard[userId] = (leaderboard[userId] || 0) + 1;

  const updatedConfig = {
    ...config,
    leaderboard,
    lastUserId: userId,
    currentStreak: (config.currentStreak || 0) + 1,
    bestStreak: Math.max(config.bestStreak || 0, (config.currentStreak || 0) + 1),
    nextNumber: (config.nextNumber || 1) + 1,
  };

  return saveCountingGameConfig(client, guildId, updatedConfig);
}

export function getCountingSystemChoices() {
  return Object.entries(COUNTING_SYSTEMS).map(([value, system]) => ({
    name: system.label,
    value,
  }));
}

export function getCountingSystemLabel(systemKey) {
  return COUNTING_SYSTEMS[systemKey]?.label || COUNTING_SYSTEMS.decimal.label;
}

export function getExpectedCountValue(config) {
  const system = COUNTING_SYSTEMS[config.system] ? config.system : 'decimal';
  return COUNTING_SYSTEMS[system].toString(config.nextNumber || 1);
}

export function isValidCountingMessage(content, config) {
  const trimmed = content.trim();
  const system = COUNTING_SYSTEMS[config.system] ? config.system : 'decimal';
  const current = COUNTING_SYSTEMS[system];
  if (system === 'math') {
    const parsedValue = current.parse(trimmed);
    return parsedValue === config.nextNumber;
  }

  const expected = current.toString(config.nextNumber || 1);
  if (system === 'alphabet' || system === 'roman') {
    return trimmed.toUpperCase() === expected.toUpperCase();
  }
  return trimmed === expected;
}

export async function activateCountingGame(client, guildId, channelId, system = 'decimal') {
  const normalizedSystem = COUNTING_SYSTEMS[system] ? system : 'decimal';
  const config = normalizeCountingGame({
    enabled: true,
    channelId,
    system: normalizedSystem,
    nextNumber: 1,
    lastUserId: null,
    currentStreak: 0,
    bestStreak: 0,
    leaderboard: {},
  });

  return saveCountingGameConfig(client, guildId, config);
}

export function buildCountingLeaderboard(config, guild) {
  const entries = Object.entries(config.leaderboard || {});
  if (entries.length === 0) {
    return [];
  }

  return entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([userId, count], index) => {
      const member = guild?.members?.cache?.get(userId);
      const username = member ? `${member.user.username}#${member.user.discriminator}` : `<@${userId}>`;
      return `**${index + 1}.** ${username} — ${count} ${count === 1 ? 'count' : 'counts'}`;
    });
}
