import { Events } from "discord.js";
import { exec } from "child_process";
import { promisify } from "util";
import { logger, startupLog } from "../utils/logger.js";
import { buildPanel, buildQueueEmptyPanel, getVoteRequired } from "../utils/musicPanel.js";
import { syncFromGuild } from "../utils/presenceSync.js";
import config from "../config/application.js";
import { reconcileReactionRoleMessages } from "../services/reactionRoleService.js";
import { loadAndScheduleTempRoles } from "../services/tempRoleService.js";
import { loadAndScheduleTempBans } from "../services/tempbanService.js";

const execAsync = promisify(exec);

async function ytDlpFallback(player, track) {
  try {
    const identifier = track?.info?.identifier;
    if (!identifier) return null;
    const { stdout } = await execAsync(
      `yt-dlp --format "bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio" --get-url "https://www.youtube.com/watch?v=${identifier}"`,
      { timeout: 20000 }
    );
    const streamUrl = stdout.trim().split('\n')[0];
    if (!streamUrl?.startsWith('http')) return null;
    const result = await player.search({ query: streamUrl }, null);
    const fallback = result.tracks?.[0];
    if (!fallback) return null;
    // Preserve original metadata so the music panel shows the right title
    fallback.info.title = track.info.title ?? fallback.info.title;
    fallback.info.author = track.info.author ?? fallback.info.author;
    fallback.info.artworkUrl = track.info.artworkUrl ?? fallback.info.artworkUrl;
    fallback.info.duration = track.info.duration ?? fallback.info.duration;
    return fallback;
  } catch (err) {
    logger.warn(`yt-dlp fallback failed for ${track?.info?.identifier}:`, err?.message);
    return null;
  }
}

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
      // Seed persistent blacklist — merge .env baseline with DB-persisted changes
      const envIds = process.env.BLACKLISTED_USERS?.split(',').map(id => id.trim()).filter(Boolean) ?? [];
      const dbIds = (await client.db.get('blacklist:users').catch(() => null)) ?? [];
      client.botBlacklist = new Set([...envIds, ...dbIds]);

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
          client.musicRetrying?.delete(player.guildId);
          if (player.queue.current) client.musicLastTrack?.set(player.guildId, player.queue.current);
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
          const panel = client.musicPanels?.get(player.guildId);
          clearPanelInterval(panel);

          // Normal finish or skip: manually advance queue (autoSkip is disabled)
          if (reason === 'finished' || reason === 'stopped') {
            if (player.queue.current) {
              try { await player.play({ paused: false }); } catch {}
            }
            return;
          }

          // replaced / cleanup: the triggering action handles advancement
          if (reason !== 'loadFailed') return;

          // loadFailed: skip if trackError is already handling this via yt-dlp
          if (client.musicRetrying?.has(player.guildId)) return;

          // loadFailed: try yt-dlp, then skip
          if (track?.info?.identifier) {
            client.musicRetrying?.add(player.guildId);
            const retryTrack = await ytDlpFallback(player, track);
            client.musicRetrying?.delete(player.guildId);
            if (retryTrack) {
              try {
                await player.queue.add(retryTrack, 0);
                await player.play({ paused: false });
                return;
              } catch {}
            }
          }

          const channel = client.channels.cache.get(panel?.textChannelId);
          await channel?.send({ content: `⚠️ Failed to load **${track?.info?.title ?? 'a track'}** — skipping.` }).catch(() => {});
          if (player.queue.current) {
            try { await player.play({ paused: false }); return; } catch {}
          }
          const message = await channel?.messages.fetch(panel?.messageId).catch(() => null);
          if (message) await message.edit(buildQueueEmptyPanel()).catch(() => {});
        });

        client.lavalink.on('trackStuck', async (player, track) => {
          logger.warn(`Track stuck in guild ${player.guildId}: "${track?.info?.title}"`);
          const panel = client.musicPanels?.get(player.guildId);
          clearPanelInterval(panel);
          const channel = client.channels.cache.get(panel?.textChannelId);
          await channel?.send({ content: `⚠️ **${track?.info?.title ?? 'A track'}** got stuck and was skipped.` }).catch(() => {});
          try {
            await player.skip();
          } catch {
            client.musicVotes?.delete(player.guildId);
            if (panel) {
              panel.isPaused = false;
              const message = await channel?.messages.fetch(panel.messageId).catch(() => null);
              if (message) await message.edit(buildQueueEmptyPanel()).catch(() => {});
            }
          }
        });

        client.lavalink.on('trackError', async (player, track, payload) => {
          const reason = payload?.exception?.message || payload?.exception?.cause || payload?.error || 'unknown';
          logger.warn(`Track error in guild ${player.guildId}: "${track?.info?.title}" — ${reason}`);
          const panel = client.musicPanels?.get(player.guildId);
          clearPanelInterval(panel);

          // Don't retry again if we already tried
          if (!client.musicRetrying?.has(player.guildId)) {
            const isYouTube = track?.info?.sourceName === 'youtube' || track?.info?.uri?.includes('youtube');
            if (isYouTube && track?.info?.identifier) {
              client.musicRetrying?.add(player.guildId);
              const ytdlpTrack = await ytDlpFallback(player, track);
              client.musicRetrying?.delete(player.guildId);
              if (ytdlpTrack) {
                logger.info(`yt-dlp fallback succeeded for "${track.info.title}" in guild ${player.guildId}`);
                try {
                  await player.queue.add(ytdlpTrack, 0);
                  await player.play({ paused: false });
                  return;
                } catch (err) {
                  logger.warn(`Failed to play yt-dlp track in guild ${player.guildId}:`, err?.message);
                }
              }
            }
          }

          client.musicRetrying?.delete(player.guildId);
          const channel = client.channels.cache.get(panel?.textChannelId);
          await channel?.send({ content: `⚠️ **${track?.info?.title ?? 'A track'}** failed to play — skipping.` }).catch(() => {});
          if (player.queue.current) {
            try { await player.play({ paused: false }); return; } catch {}
          }
          client.musicVotes?.delete(player.guildId);
          if (panel) {
            panel.isPaused = false;
            const message = await channel?.messages.fetch(panel?.messageId).catch(() => null);
            if (message) await message.edit(buildQueueEmptyPanel()).catch(() => {});
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
