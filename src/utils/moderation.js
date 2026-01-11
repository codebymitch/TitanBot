import { EmbedBuilder } from 'discord.js';
import { getGuildConfig } from '../services/guildConfig.js';

/**
 * Logs an event to the configured log channel
 * @param {Object} options - The log options
 * @param {import('discord.js').Client} options.client - The Discord client
 * @param {string} options.guildId - The ID of the guild
 * @param {Object} options.event - The event details
 * @param {string} options.event.action - The action that was taken
 * @param {string} options.event.target - The target of the action
 * @param {string} options.event.executor - The user who performed the action
 * @param {string} [options.event.reason] - The reason for the action
 * @param {string} [options.event.duration] - The duration of the action (for timeouts)
 * @returns {Promise<void>}
 */
export async function logEvent({ client, guildId, event }) {
  try {
    // Get the guild configuration
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const config = await getGuildConfig(client, guildId);
    if (!config?.logChannelId) return;

    const logChannel = guild.channels.cache.get(config.logChannelId);
    if (!logChannel) return;

    // Create the embed
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`🔨 ${event.action}`)
      .addFields(
        { name: "Target", value: event.target, inline: true },
        { name: "Moderator", value: event.executor, inline: true },
      )
      .setTimestamp();

    if (event.reason) {
      embed.addFields({
        name: "Reason",
        value: event.reason,
        inline: false,
      });
    }

    if (event.duration) {
      embed.addFields({
        name: "Duration",
        value: event.duration,
        inline: true,
      });
    }

    // Send the log message
    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error("Error logging event:", error);
  }
}
