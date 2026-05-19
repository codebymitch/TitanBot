import axios from 'axios';
import crypto from 'crypto';

const DISCORD_API = 'https://discord.com/api';

const ADMINISTRATOR = 1n << 3n;
const MANAGE_GUILD = 1n << 5n;

export function getRedirectUri() {
  return process.env.REDIRECT_URI || '';
}

/**
 * Build the Discord OAuth2 authorize URL. `state` is an unguessable
 * value stored in the session and verified on callback (OAuth CSRF).
 */
export function buildAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.CLIENT_ID || '',
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: 'identify guilds',
    state,
    prompt: 'consent',
  });
  return `${DISCORD_API}/oauth2/authorize?${params.toString()}`;
}

export function makeState() {
  return crypto.randomBytes(24).toString('hex');
}

export async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: process.env.CLIENT_ID || '',
    client_secret: process.env.CLIENT_SECRET || '',
    grant_type: 'authorization_code',
    code,
    redirect_uri: getRedirectUri(),
  });

  const { data } = await axios.post(`${DISCORD_API}/oauth2/token`, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10000,
  });
  return data;
}

export async function fetchIdentity(accessToken) {
  const headers = { Authorization: `Bearer ${accessToken}` };

  const [userRes, guildsRes] = await Promise.all([
    axios.get(`${DISCORD_API}/users/@me`, { headers, timeout: 10000 }),
    axios.get(`${DISCORD_API}/users/@me/guilds`, { headers, timeout: 10000 }),
  ]);

  return { user: userRes.data, guilds: guildsRes.data };
}

/**
 * True if the member has ADMINISTRATOR or MANAGE_GUILD on this guild.
 * Discord sends permissions as a string bitfield — must use BigInt,
 * the old `(perms & 0x8)` Number math silently breaks for high bits.
 */
export function hasGuildAdmin(guildEntry) {
  if (!guildEntry) return false;
  if (guildEntry.owner) return true;
  let perms;
  try {
    perms = BigInt(guildEntry.permissions ?? 0);
  } catch {
    return false;
  }
  return (perms & ADMINISTRATOR) === ADMINISTRATOR ||
    (perms & MANAGE_GUILD) === MANAGE_GUILD;
}

/**
 * Guilds where the logged-in user is an admin AND the bot is present.
 */
export function manageableGuilds(sessionGuilds, client) {
  const botGuildIds = new Set(client.guilds.cache.map((g) => g.id));
  return (sessionGuilds || [])
    .filter((g) => hasGuildAdmin(g) && botGuildIds.has(g.id));
}
