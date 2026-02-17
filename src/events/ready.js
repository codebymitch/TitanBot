import { Events } from "discord.js";
import { logger } from "../utils/logger.js";
import config from "../config/application.js";

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    try {
      client.user.setPresence(config.bot.presence);

      logger.info(`Ready! Logged in as ${client.user.tag}`);
      logger.info(`Serving ${client.guilds.cache.size} guild(s)`);
      logger.info(`Loaded ${client.commands.size} commands`);
    } catch (error) {
      logger.error("Error in ready event:", error);
    }
  },
};


