import crypto from 'crypto';
import { getConfig } from '../modules/community/store.js';
import { logger } from '../utils/logger.js';

const GUILD_ID = '1526671786387705907';
const HEARTBEAT_URL = 'https://editil.itay-kman.workers.dev/api/heartbeat';
const INTERVAL_MS = 30_000;

const heartbeatSecret = client => crypto.createHash('sha256').update(`${client.config.bot.token}:editil-status`).digest('hex');

export async function sendWebsiteStatus(client) {
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild || !client.isReady()) return false;
    const config = await getConfig(client, GUILD_ID);
    const channels = guild.channels.cache.filter(channel => !channel.isThread());
    const resources = channels.filter(channel => /resource|asset|preset|משאב|פריסט/i.test(channel.name)).size;
    const response = await fetch(HEARTBEAT_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${heartbeatSecret(client)}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        bot: {
          avatar: client.user.displayAvatarURL({ extension: 'webp', size: 256 }),
          commands: client.commands.size,
          latency: Math.max(0, Math.round(client.ws.ping || 0)),
          servers: client.guilds.cache.size
        },
        community: {
          members: guild.memberCount || 0,
          channels: channels.size,
          resources,
          competitions: config.contests?.active ? 1 : 0
        }
      }),
      signal: AbortSignal.timeout(8_000)
    });
    if (!response.ok) throw new Error(`Heartbeat returned HTTP ${response.status}`);
    return true;
  } catch (error) {
    logger.warn('Website status heartbeat failed', { error: error.message });
    return false;
  }
}

export function startWebsiteStatusHeartbeat(client) {
  if (client.websiteStatusTimer) return;
  void sendWebsiteStatus(client);
  client.websiteStatusTimer = setInterval(() => void sendWebsiteStatus(client), INTERVAL_MS);
  client.websiteStatusTimer.unref?.();
}
