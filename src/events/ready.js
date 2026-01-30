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

      console.log(`=== BOT READY ===`);
      console.log(`Logged in as: ${client.user.tag}`);
      console.log(`Client ID: ${client.user.id}`);
      console.log(`Serving ${client.guilds.cache.size} guild(s)`);
      console.log(`Loaded ${client.commands.size} commands in memory`);
      
      // Debug: List first 10 commands
      const commandNames = Array.from(client.commands.keys()).slice(0, 10);
      console.log(`Sample commands: ${commandNames.join(', ')}`);
      
      logger.info(`Ready! Logged in as ${client.user.tag}`);
      logger.info(`Serving ${client.guilds.cache.size} guild(s)`);
      logger.info(`Loaded ${client.commands.size} commands`);
      
      // Debug: List first 10 commands
      const loggerCommandNames = Array.from(client.commands.keys()).slice(0, 10);
      logger.debug(`Sample commands: ${loggerCommandNames.join(', ')}`);
      
      console.log('=== BOT FULLY OPERATIONAL ===');
    } catch (error) {
      console.error("Error in ready event:", error);
      logger.error("Error in ready event:", error);
    }
  },
};
