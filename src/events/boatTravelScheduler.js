import { Events } from 'discord.js';
import cron from 'node-cron';
import { processAllJourneys } from '../services/berryTravel.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    cron.schedule('* * * * *', async () => {
      try {
        await processAllJourneys(client);
      } catch (error) {
        logger.error('Scheduled island travel update failed:', error);
      }
    });
  }
};
