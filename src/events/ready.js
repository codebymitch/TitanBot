import { Events } from "discord.js";
import { logger, startupLog } from "../utils/logger.js";
import { buildPanel, buildQueueEmptyPanel, getVoteRequired } from "../utils/musicPanel.js";
import { syncFromGuild } from "../utils/presenceSync.js";
import config from "../config/application.js";
import { reconcileReactionRoleMessages } from "../services/reactionRoleService.js";
import { loadAndScheduleTempRoles } from "../services/tempRoleService.js";
import { loadAndScheduleTempBans } from "../services/tempbanService.js";

function clearPanelInterval(panel) {
    if (panel?.progressInterval) {
        clearInterval(panel.progressInterval);
        panel.progressInterval = null;
    }
}

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    try {
      const { status, activities } = config.bot.presence;
      let activityIndex = 0;

      const setActivity = () => {
        client.user.setPresence({
          status,
          activities: [activities[activityIndex]],
        });
        activityIndex = (activityIndex + 1) % activities.length;
      };

      setActivity();
      client._presenceInterval = setInterval(setActivity, 30_000);

      // Poll the mirror user's presence every 60s as a fallback for missed presenceUpdate events
      setInterval(() => syncFromGuild(client), 60_000);

      startupLog(`Ready! Logged in as ${client.user.tag}`);

      const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&scope=bot+applications.commands&permissions=8`;
      startupLog(`Invite link: ${inviteUrl}`);
      startupLog(`Serving ${client.guilds.cache.size} guild(s)`);
      startupLog(`Loaded ${client.commands.size} commands`);

      const reconciliationSummary = await reconcileReactionRoleMessages(client);
      startupLog(
        `Reaction role reconciliation: scanned ${reconciliationSummary.scannedMessages}, removed ${reconciliationSummary.removedMessages}, errors ${reconciliationSummary.errors}`
      );

      await loadAndScheduleTempRoles(client);
      await loadAndScheduleTempBans(client);

      if (client.lavalink) {
        await client.lavalink.init(client.user);
        client.lavalink.nodeManager.on('connect', node => startupLog(`Lavalink node connected: ${node.id}`));
        client.lavalink.nodeManager.on('error', (node, err) => logger.error(`Lavalink [${node.id}]:`, err?.message));

        client.lavalink.on('trackStart', async (player) => {
          client.musicVotes?.delete(player.guildId);
          const panel = client.musicPanels?.get(player.guildId);
          if (!panel) return;
          panel.isPaused = false;

          // Clear any old progress interval before starting a new one
          clearPanelInterval(panel);

          const channel = client.channels.cache.get(panel.textChannelId);
          const message = await channel?.messages.fetch(panel.messageId).catch(() => null);
          if (!message) return;

          const required = getVoteRequired(player, client);
          await message.edit(buildPanel(player, 0, required, false, panel.activeFilter)).catch(() => {});

          // Live progress bar — update panel every 30s
          panel.progressInterval = setInterval(async () => {
            const currentPanel = client.musicPanels?.get(player.guildId);
            if (!currentPanel || !player.queue.current) return clearPanelInterval(currentPanel);
            const ch = client.channels.cache.get(currentPanel.textChannelId);
            const msg = await ch?.messages.fetch(currentPanel.messageId).catch(() => null);
            if (!msg) return clearPanelInterval(currentPanel);
            const req = getVoteRequired(player, client);
            const votes = client.musicVotes?.get(player.guildId)?.size ?? 0;
            await msg.edit(buildPanel(player, votes, req, currentPanel.isPaused, currentPanel.activeFilter)).catch(() => {});
          }, 30_000);
        });

        client.lavalink.on('trackEnd', async (player, track, payload) => {
          const reason = payload?.reason ?? 'unknown';
          if (reason !== 'finished' && reason !== 'replaced') {
            logger.warn(`Track ended unexpectedly in guild ${player.guildId}: "${track?.info?.title}" — reason: ${reason}`);
          }
          // Clear progress interval on any track end
          const panel = client.musicPanels?.get(player.guildId);
          clearPanelInterval(panel);

          if (reason === 'loadFailed') {
            if (panel) {
              const channel = client.channels.cache.get(panel.textChannelId);
              const message = await channel?.messages.fetch(panel.messageId).catch(() => null);
              if (message && !player.queue.tracks.length && !player.queue.current) {
                await message.edit(buildQueueEmptyPanel()).catch(() => {});
              }
            }
          }
        });

        client.lavalink.on('trackError', async (player, track, payload) => {
          const reason = payload?.exception?.message || payload?.exception?.cause || payload?.error || 'unknown';
          logger.warn(`Track error in guild ${player.guildId}: "${track?.info?.title}" — ${reason} | uri: ${track?.info?.uri}`);
          const panel = client.musicPanels?.get(player.guildId);
          clearPanelInterval(panel);
          try {
            await player.skip();
          } catch {
            client.musicVotes?.delete(player.guildId);
            if (panel) {
              panel.isPaused = false;
              const channel = client.channels.cache.get(panel.textChannelId);
              const message = await channel?.messages.fetch(panel.messageId).catch(() => null);
              if (message) await message.edit(buildQueueEmptyPanel()).catch(() => {});
            }
            player.destroy().catch(() => {});
          }
        });

        client.lavalink.on('queueEnd', async (player) => {
          client.musicVotes?.delete(player.guildId);
          const panel = client.musicPanels?.get(player.guildId);
          clearPanelInterval(panel);
          if (panel) {
            panel.isPaused = false;
            const channel = client.channels.cache.get(panel.textChannelId);
            const message = await channel?.messages.fetch(panel.messageId).catch(() => null);
            if (message) await message.edit(buildQueueEmptyPanel()).catch(() => {});
          }
          // Destroy player after 3 minutes if nothing is added
          setTimeout(() => {
            if (!player.playing) {
              const p = client.musicPanels?.get(player.guildId);
              clearPanelInterval(p);
              client.musicPanels?.delete(player.guildId);
              player.destroy().catch(() => {});
            }
          }, 3 * 60_000);
        });

        startupLog('Lavalink manager initialized');
      }
    } catch (error) {
      logger.error("Error in ready event:", error);
    }
  },
};
