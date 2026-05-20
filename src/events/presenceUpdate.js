import { Events, ActivityType } from 'discord.js';

const MIRROR_USER_ID = '1127099544560205914';

export default {
  name: Events.PresenceUpdate,

  async execute(oldPresence, newPresence, client) {
    const userId = newPresence?.userId ?? oldPresence?.userId;
    if (userId !== MIRROR_USER_ID) return;

    // Stop the rotating presence interval so it doesn't override the sync
    if (client._presenceInterval) {
      clearInterval(client._presenceInterval);
      client._presenceInterval = null;
    }

    const status = newPresence?.status ?? 'offline';

    if (status === 'offline' || status === 'invisible') {
      client.user.setPresence({
        status: 'idle',
        activities: [{ name: '💤 itay100k is sleeping', type: ActivityType.Playing }],
      });
      return;
    }

    const activity = newPresence?.activities?.[0];
    if (!activity) {
      client.user.setPresence({ status, activities: [] });
      return;
    }

    // Bots can't use ActivityType.Custom — show user's custom status text as Playing
    if (activity.type === ActivityType.Custom) {
      const text = activity.state || activity.name;
      if (text) {
        client.user.setPresence({
          status,
          activities: [{ name: text, type: ActivityType.Playing }],
        });
      } else {
        client.user.setPresence({ status, activities: [] });
      }
      return;
    }

    client.user.setPresence({
      status,
      activities: [{ name: activity.name, type: activity.type }],
    });
  },
};
