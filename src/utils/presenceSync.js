import { ActivityType } from 'discord.js';

export const MIRROR_USER_ID = '1127099544560205914';

export function applyPresence(client, status, activities) {
  if (status === 'offline' || status === 'invisible' || !status) {
    client.user.setPresence({
      status: 'idle',
      activities: [{ name: '💤 itay100k is sleeping', type: ActivityType.Playing }],
    });
    return;
  }

  const activity = activities?.[0];
  if (!activity) {
    client.user.setPresence({ status, activities: [] });
    return;
  }

  // Bots cannot use ActivityType.Custom — show the text as Playing instead
  if (activity.type === ActivityType.Custom) {
    const text = activity.state || activity.name;
    client.user.setPresence({
      status,
      activities: text ? [{ name: text, type: ActivityType.Playing }] : [],
    });
    return;
  }

  client.user.setPresence({ status, activities: [{ name: activity.name, type: activity.type }] });
}

export function syncFromGuild(client) {
  for (const guild of client.guilds.cache.values()) {
    const presence = guild.presences.cache.get(MIRROR_USER_ID);
    if (presence) {
      applyPresence(client, presence.status, presence.activities);
      return;
    }
  }
  // Not found in any guild presence cache — user is offline
  applyPresence(client, 'offline', []);
}
