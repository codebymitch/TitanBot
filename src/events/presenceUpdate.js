import { Events, ActivityType } from 'discord.js';

const MIRROR_USER_ID = '1127099544560205914';

export default {
  name: Events.PresenceUpdate,

  async execute(oldPresence, newPresence, client) {
    if (newPresence?.userId !== MIRROR_USER_ID) return;

    // Stop the rotating presence interval so it doesn't override the sync
    if (client._presenceInterval) {
      clearInterval(client._presenceInterval);
      client._presenceInterval = null;
    }

    const status = newPresence.status ?? 'online';

    if (status === 'offline' || status === 'invisible') {
      client.user.setPresence({
        status: 'idle',
        activities: [{ name: '💤 itay100k is sleeping', type: ActivityType.Custom }],
      });
      return;
    }

    const activity = newPresence.activities?.[0];
    if (!activity) {
      client.user.setPresence({ status, activities: [] });
      return;
    }

    if (activity.type === ActivityType.Custom) {
      client.user.setPresence({
        status,
        activities: [{ name: activity.state || 'custom', type: ActivityType.Custom }],
      });
      return;
    }

    client.user.setPresence({
      status,
      activities: [{ name: activity.name, type: activity.type }],
    });
  },
};
