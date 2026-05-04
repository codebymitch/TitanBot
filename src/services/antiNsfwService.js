import { logger } from '../utils/logger.js';
import { createEmbed } from '../utils/embeds.js';

const CONFIG_KEY = guildId => `antinsfw:config:${guildId}`;

const DEFAULT_CONFIG = {
    enabled: false,
    action: 'delete',
    timeoutDuration: 5 * 60 * 1000,
    logChannelId: null,
    exemptChannels: [],
    exemptRoles: [],
    customWords: [],
    imageScanning: true,
    nudityThreshold: 0.75,
};

// Known adult content domains to block
const BLOCKED_DOMAINS = [
    'pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com',
    'redtube.com', 'youporn.com', 'tube8.com', 'spankbang.com',
    'beeg.com', 'eporner.com', 'thisvid.com', 'motherless.com',
    'hentaihaven.xxx', 'rule34.xxx', 'gelbooru.com', 'danbooru.donmai.us',
    'e621.net', 'nhentai.net', 'hanime.tv', 'literotica.com',
    'chaturbate.com', 'cam4.com', 'bongacams.com', 'stripchat.com',
    'onlyfans.com', 'fansly.com',
];

// Base keyword list — users can extend via /antinsfw words add
const BASE_NSFW_WORDS = [
    'pornhub', 'xvideos', 'onlyfans', 'fansly', 'camgirl',
    'nsfw', 'hentai', 'nude', 'nudes', 'nudity',
    'sex tape', 'sextape', 'xxx', 'porn',
];

export const AntiNsfwService = {
    async getConfig(client, guildId) {
        const stored = await client.db.get(CONFIG_KEY(guildId), null);
        return { ...DEFAULT_CONFIG, ...(stored || {}) };
    },

    async setConfig(client, guildId, updates) {
        const current = await this.getConfig(client, guildId);
        const updated = { ...current, ...updates };
        await client.db.set(CONFIG_KEY(guildId), updated);
        return updated;
    },

    // Returns true if the message was flagged and acted upon
    async checkMessage(client, message) {
        try {
            const config = await this.getConfig(client, message.guild.id);
            if (!config.enabled) return false;

            // Skip NSFW-marked channels (they're allowed to have adult content)
            if (message.channel.nsfw) return false;

            if (config.exemptChannels.includes(message.channel.id)) return false;

            if (config.exemptRoles.length > 0) {
                const member = message.member
                    ?? await message.guild.members.fetch(message.author.id).catch(() => null);
                if (member && member.roles.cache.some(r => config.exemptRoles.includes(r.id))) {
                    return false;
                }
            }

            // Text / link check
            const textViolation = this._checkText(message.content, config);
            if (textViolation) {
                await this._handleViolation(client, message, config, textViolation);
                return true;
            }

            // Image / video attachment scan via Sightengine
            if (config.imageScanning && message.attachments.size > 0) {
                const media = [...message.attachments.values()].filter(a =>
                    a.contentType?.startsWith('image/') || a.contentType?.startsWith('video/')
                );
                for (const attachment of media) {
                    const result = await this._scanImage(attachment.url, config.nudityThreshold);
                    if (result.flagged) {
                        await this._handleViolation(client, message, config, {
                            type: 'image',
                            reason: `Explicit image/video detected (${Math.round(result.score * 100)}% confidence)`,
                        });
                        return true;
                    }
                }
            }

            return false;
        } catch (err) {
            logger.error('AntiNSFW checkMessage error:', err);
            return false;
        }
    },

    _checkText(content, config) {
        if (!content) return null;
        const lower = content.toLowerCase();

        for (const domain of BLOCKED_DOMAINS) {
            if (lower.includes(domain)) {
                return { type: 'domain', reason: `Link to adult site blocked (${domain})` };
            }
        }

        const allWords = [...BASE_NSFW_WORDS, ...(config.customWords || [])];
        for (const word of allWords) {
            const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (new RegExp(`\\b${escaped}\\b`, 'i').test(lower)) {
                return { type: 'keyword', reason: `NSFW keyword detected` };
            }
        }

        return null;
    },

    async _scanImage(url, threshold) {
        const apiUser = process.env.SIGHTENGINE_API_USER;
        const apiSecret = process.env.SIGHTENGINE_API_SECRET;
        if (!apiUser || !apiSecret) return { flagged: false, score: 0 };

        try {
            const params = new URLSearchParams({
                url,
                models: 'nudity-2.0',
                api_user: apiUser,
                api_secret: apiSecret,
            });
            const res = await fetch(`https://api.sightengine.com/1.0/check.json?${params}`, {
                signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) return { flagged: false, score: 0 };
            const data = await res.json();
            if (data.status !== 'success') return { flagged: false, score: 0 };

            const n = data.nudity ?? {};
            const score = Math.max(
                n.sexual_activity ?? 0,
                n.sexual_display ?? 0,
                n.erotica ?? 0,
            );
            return { flagged: score >= threshold, score };
        } catch (err) {
            logger.error('Sightengine scan error:', err);
            return { flagged: false, score: 0 };
        }
    },

    async _handleViolation(client, message, config, violation) {
        await message.delete().catch(() => {});

        const member = message.member
            ?? await message.guild.members.fetch(message.author.id).catch(() => null);

        if (config.action !== 'delete' && member) {
            try {
                switch (config.action) {
                    case 'warn':
                        await member.send(
                            `You were warned in **${message.guild.name}** for sending NSFW content.`
                        ).catch(() => {});
                        break;
                    case 'timeout':
                        await member.timeout(
                            config.timeoutDuration,
                            `Anti-NSFW: ${violation.reason}`
                        );
                        break;
                    case 'kick':
                        await member.kick(`Anti-NSFW: ${violation.reason}`);
                        break;
                    case 'ban':
                        await message.guild.members.ban(message.author.id, {
                            reason: `Anti-NSFW: ${violation.reason}`,
                        });
                        break;
                }
            } catch (err) {
                logger.error('AntiNSFW action error:', err);
            }
        }

        if (config.logChannelId) {
            const logChannel = message.guild.channels.cache.get(config.logChannelId);
            if (logChannel?.isTextBased()) {
                const embed = createEmbed({
                    title: 'NSFW Violation Detected',
                    description: [
                        `**User:** ${message.author} (${message.author.id})`,
                        `**Channel:** <#${message.channel.id}>`,
                        `**Detection type:** ${violation.type}`,
                        `**Reason:** ${violation.reason}`,
                        `**Action taken:** ${config.action}`,
                    ].join('\n'),
                    color: 'red',
                });
                logChannel.send({ embeds: [embed] }).catch(() => {});
            }
        }

        logger.info(
            `AntiNSFW: removed message from ${message.author.id} in ${message.guild.id} ` +
            `(${violation.type}) — action: ${config.action}`
        );
    },

    getBlockedDomains() {
        return [...BLOCKED_DOMAINS];
    },

    getBaseWords() {
        return [...BASE_NSFW_WORDS];
    },
};
