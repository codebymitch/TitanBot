import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';
import { getApplications, getApplication, getApplicationRoles, updateApplication } from '../../utils/database.js';
import { getColor } from '../../config/bot.js';

const MANAGE_GUILD = 0x20;

const ALLOWED_CONFIG_KEYS = new Set([
    'prefix', 'modRole', 'adminRole',
    'welcomeChannel', 'welcomeMessage', 'autoRole',
    'dmOnClose',
    'ticketPanelChannelId', 'ticketStaffRoleId', 'ticketCategoryId',
    'ticketClosedCategoryId', 'ticketPanelMessage', 'ticketButtonLabel',
    'maxTicketsPerUser', 'ticketLogsChannelId', 'ticketTranscriptChannelId',
    'logging',
    'leveling',
    'birthdayChannelId', 'birthdayRoleId',
    'verification',
]);

export function createApiRouter(client) {
    const router = Router();
    router.use(requireAuth);

    router.get('/me', (req, res) => {
        const { id, username, avatar } = req.session.user;
        res.json({ id, username, avatar });
    });

    router.get('/guilds', (req, res) => {
        const userGuilds = req.session.guilds || [];
        const managedGuilds = userGuilds.filter(g => (BigInt(g.permissions) & BigInt(MANAGE_GUILD)) === BigInt(MANAGE_GUILD));
        const botGuildIds = new Set(client.guilds.cache.keys());

        const guilds = managedGuilds
            .filter(g => botGuildIds.has(g.id))
            .map(g => ({
                id: g.id,
                name: g.name,
                icon: g.icon,
            }));

        res.json(guilds);
    });

    router.get('/guilds/:id', async (req, res) => {
        const { id } = req.params;
        if (!canManageGuild(req, id)) return res.status(403).json({ error: 'Forbidden' });

        const guild = client.guilds.cache.get(id);
        if (!guild) return res.status(404).json({ error: 'Bot is not in this guild' });

        const channels = guild.channels.cache
            .filter(c => c.type !== undefined)
            .map(c => ({ id: c.id, name: c.name, type: c.type }))
            .sort((a, b) => a.name.localeCompare(b.name));

        const roles = guild.roles.cache
            .filter(r => r.id !== guild.id)
            .map(r => ({ id: r.id, name: r.name, color: r.hexColor }))
            .sort((a, b) => b.rawPosition - a.rawPosition);

        res.json({ id: guild.id, name: guild.name, icon: guild.iconURL(), channels, roles });
    });

    router.get('/guilds/:id/config', async (req, res) => {
        const { id } = req.params;
        if (!canManageGuild(req, id)) return res.status(403).json({ error: 'Forbidden' });

        try {
            const config = await getGuildConfig(client, id);
            res.json(config);
        } catch (err) {
            res.status(500).json({ error: 'Failed to load config' });
        }
    });

    router.patch('/guilds/:id/config', async (req, res) => {
        const { id } = req.params;
        if (!canManageGuild(req, id)) return res.status(403).json({ error: 'Forbidden' });

        const updates = {};
        for (const [key, value] of Object.entries(req.body)) {
            if (ALLOWED_CONFIG_KEYS.has(key)) {
                updates[key] = value;
            }
        }

        try {
            const updated = await updateGuildConfig(client, id, updates);
            res.json(updated);
        } catch (err) {
            res.status(500).json({ error: 'Failed to save config' });
        }
    });

    // Applications endpoints
    router.get('/guilds/:id/application-roles', async (req, res) => {
        const { id } = req.params;
        if (!canManageGuild(req, id)) return res.status(403).json({ error: 'Forbidden' });
        try {
            const roles = await getApplicationRoles(client, id);
            res.json(roles);
        } catch (err) {
            res.status(500).json({ error: 'Failed to load application roles' });
        }
    });

    router.get('/guilds/:id/applications', async (req, res) => {
        const { id } = req.params;
        if (!canManageGuild(req, id)) return res.status(403).json({ error: 'Forbidden' });
        try {
            const filters = {};
            if (req.query.status) filters.status = req.query.status;
            let apps = await getApplications(client, id, filters);
            if (req.query.roleId) apps = apps.filter(a => a.roleId === req.query.roleId);
            res.json(apps);
        } catch (err) {
            res.status(500).json({ error: 'Failed to load applications' });
        }
    });

    router.post('/guilds/:id/applications/:appId/review', async (req, res) => {
        const { id, appId } = req.params;
        if (!canManageGuild(req, id)) return res.status(403).json({ error: 'Forbidden' });

        const { action, reason } = req.body;
        if (!['approve', 'deny'].includes(action)) {
            return res.status(400).json({ error: 'action must be approve or deny' });
        }

        try {
            const application = await getApplication(client, id, appId);
            if (!application) return res.status(404).json({ error: 'Application not found' });
            if (application.status !== 'pending') {
                return res.status(409).json({ error: 'Application already reviewed' });
            }

            const status = action === 'approve' ? 'approved' : 'denied';
            const sanitizedReason = (reason || 'No reason provided.').trim().substring(0, 500);
            const reviewerId = req.session.user.id;

            await updateApplication(client, id, appId, {
                status,
                reviewer: reviewerId,
                reviewMessage: sanitizedReason,
                reviewedAt: new Date().toISOString(),
            });

            // DM the applicant
            try {
                const guild = client.guilds.cache.get(id);
                const user = await client.users.fetch(application.userId);
                const { EmbedBuilder } = await import('discord.js');
                const color = action === 'approve' ? 0x2ecc71 : 0xe74c3c;
                const statusLabel = action === 'approve' ? 'Accepted' : 'Denied';
                const emoji = action === 'approve' ? '🟢' : '🔴';
                const dmEmbed = new EmbedBuilder()
                    .setTitle(`${emoji} Application ${statusLabel}`)
                    .setDescription(
                        `Your application for **${application.roleName}** has been **${statusLabel.toLowerCase()}**.\n` +
                        `**Note:** ${sanitizedReason}\n\n` +
                        `Use \`/apply status id:${appId}\` to view details.`
                    )
                    .setColor(color)
                    .setTimestamp();
                await user.send({ embeds: [dmEmbed] });
            } catch (_) {
                // DM failed (user has DMs closed) — not a fatal error
            }

            // Assign role if approved
            if (action === 'approve' && application.roleId) {
                try {
                    const guild = client.guilds.cache.get(id);
                    const member = await guild.members.fetch(application.userId);
                    await member.roles.add(application.roleId);
                } catch (_) {
                    // Role assignment failed — log but don't fail the request
                }
            }

            res.json({ success: true, status });
        } catch (err) {
            console.error('Application review error:', err);
            res.status(500).json({ error: 'Failed to review application' });
        }
    });

    return router;
}

function canManageGuild(req, guildId) {
    const userGuilds = req.session.guilds || [];
    const guild = userGuilds.find(g => g.id === guildId);
    if (!guild) return false;
    return (BigInt(guild.permissions) & BigInt(MANAGE_GUILD)) === BigInt(MANAGE_GUILD);
}
