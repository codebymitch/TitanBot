import { Events } from 'discord.js';
import { MIRROR_USER_ID, applyPresence } from '../utils/presenceSync.js';

export default {
  name: Events.PresenceUpdate,

  async execute(oldPresence, newPresence, client) {
    const userId = newPresence?.userId ?? oldPresence?.userId;
    if (userId !== MIRROR_USER_ID) return;

    if (client._presenceInterval) {
      clearInterval(client._presenceInterval);
      client._presenceInterval = null;
    }

    applyPresence(client, newPresence?.status, newPresence?.activities);
  },
};
