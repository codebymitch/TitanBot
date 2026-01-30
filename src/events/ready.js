import { Events } from "discord.js";
import { logger } from "../utils/logger.js";
import config from "../config/index.js";

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    try {
      // Set bot presence from configuration
      client.user.setPresence(config.bot.presence);

      logger.info(`Ready! Logged in as ${client.user.tag}`);
      logger.info(`Serving ${client.guilds.cache.size} guild(s)`);
      logger.info(`Loaded ${client.commands.size} commands`);
      
      // Debug: List first 10 commands
      const commandNames = Array.from(client.commands.keys()).slice(0, 10);
      logger.debug(`Sample commands: ${commandNames.join(', ')}`);
    } catch (error) {
      logger.error("Error in ready event:", error);
    }
  },
};
