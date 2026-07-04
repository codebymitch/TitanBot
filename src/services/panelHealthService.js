import { logger } from '../utils/logger.js';
import { getGuildConfigKey } from '../utils/database/keys.js';
import {
    getTicketPanelStatus,
    getVerificationPanelStatus,
    getReactionRolePanelStatus,
} from '../utils/panelStatus.js';
import { getAllReactionRoleMessages } from './reactionRoleService.js';

async function persistVerificationMessageId(client, guildId, config, messageId) {
    if (!messageId || config.verification?.messageId === messageId) return;
    config.verification = { ...config.verification, messageId };
    await client.db.set(getGuildConfigKey(guildId), config);
}

async function persistReactionRoleMessageId(client, guildId, panelData, messageId) {
    if (!messageId || panelData.messageId === messageId) return;
    const oldKey = `reaction_roles:${guildId}:${panelData.messageId}`;
    panelData.messageId = messageId;
    const newKey = `reaction_roles:${guildId}:${messageId}`;
    await client.db.set(newKey, panelData);
    await client.db.delete(oldKey).catch(() => {});
}

export async function reconcileTicketPanels(client) {
    const summary = {
        scannedGuilds: 0,
        healthyPanels: 0,
        deletedPanels: 0,
        missingChannels: 0,
        recoveredIds: 0,
        errors: 0,
    };

    for (const guild of client.guilds.cache.values()) {
        summary.scannedGuilds += 1;

        try {
            const config = await client.db.get(getGuildConfigKey(guild.id));
            if (!config?.ticketPanelChannelId) continue;

            const panelStatus = await getTicketPanelStatus(client, guild, config);

            if (panelStatus.recoveredId) {
                summary.recoveredIds += 1;
                config.ticketPanelMessageId = panelStatus.recoveredId;
                await client.db.set(getGuildConfigKey(guild.id), config);
            }

            if (panelStatus.exists) {
                summary.healthyPanels += 1;
            } else if (panelStatus.reason === 'channel_missing') {
                summary.missingChannels += 1;
                logger.warn(`Ticket panel channel missing for guild ${guild.id} (${guild.name})`);
            } else if (panelStatus.reason === 'panel_deleted') {
                summary.deletedPanels += 1;
                logger.warn(
                    `Ticket panel message deleted for guild ${guild.id} (${guild.name}) — admins can repost from /ticket dashboard`,
                );
            }
        } catch (error) {
            summary.errors += 1;
            logger.warn(`Ticket panel health check failed for guild ${guild.id}:`, error.message);
        }
    }

    return summary;
}

export async function reconcileVerificationPanels(client) {
    const summary = {
        scannedGuilds: 0,
        healthyPanels: 0,
        deletedPanels: 0,
        missingChannels: 0,
        recoveredIds: 0,
        errors: 0,
    };

    for (const guild of client.guilds.cache.values()) {
        summary.scannedGuilds += 1;

        try {
            const config = await client.db.get(getGuildConfigKey(guild.id));
            const verification = config?.verification;
            if (!verification?.channelId || verification.enabled === false) continue;

            const panelStatus = await getVerificationPanelStatus(client, guild, verification);

            if (panelStatus.recoveredId) {
                summary.recoveredIds += 1;
                await persistVerificationMessageId(client, guild.id, config, panelStatus.recoveredId);
            }

            if (panelStatus.exists) {
                summary.healthyPanels += 1;
            } else if (panelStatus.reason === 'channel_missing') {
                summary.missingChannels += 1;
                logger.warn(`Verification panel channel missing for guild ${guild.id} (${guild.name})`);
            } else if (panelStatus.reason === 'panel_deleted') {
                summary.deletedPanels += 1;
                logger.warn(
                    `Verification panel deleted for guild ${guild.id} (${guild.name}) — repost from /verification dashboard`,
                );
            }
        } catch (error) {
            summary.errors += 1;
            logger.warn(`Verification panel health check failed for guild ${guild.id}:`, error.message);
        }
    }

    return summary;
}

export async function reconcileReactionRolePanelHealth(client) {
    const summary = {
        scannedGuilds: 0,
        scannedPanels: 0,
        healthyPanels: 0,
        deletedPanels: 0,
        missingChannels: 0,
        recoveredIds: 0,
        errors: 0,
    };

    for (const guild of client.guilds.cache.values()) {
        summary.scannedGuilds += 1;

        try {
            const panels = await getAllReactionRoleMessages(client, guild.id);
            if (!panels?.length) continue;

            for (const panelData of panels) {
                if (!panelData?.channelId || !panelData?.messageId) continue;
                summary.scannedPanels += 1;

                const panelStatus = await getReactionRolePanelStatus(client, guild, panelData);

                if (panelStatus.recoveredId) {
                    summary.recoveredIds += 1;
                    await persistReactionRoleMessageId(client, guild.id, panelData, panelStatus.recoveredId);
                }

                if (panelStatus.exists) {
                    summary.healthyPanels += 1;
                } else if (panelStatus.reason === 'channel_missing') {
                    summary.missingChannels += 1;
                    logger.warn(
                        `Reaction role panel channel missing for guild ${guild.id}, message ${panelData.messageId}`,
                    );
                } else if (panelStatus.reason === 'panel_deleted') {
                    summary.deletedPanels += 1;
                    logger.warn(
                        `Reaction role panel deleted for guild ${guild.id} — repost from /reactroles dashboard`,
                    );
                }
            }
        } catch (error) {
            summary.errors += 1;
            logger.warn(`Reaction role panel health check failed for guild ${guild.id}:`, error.message);
        }
    }

    return summary;
}
