import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getGuildConfig, updateGuildConfig } from '../../services/guildConfig.js';

const MANAGE_GUILD = 0x20;

const ALLOWED_CONFIG_KEYS = new Set([
    'prefix', 'modRole', 'adminRole',
    'welcomeChannel', 'welcomeMessage', 'autoRole',
    'dmOnClose',
    'ticketPanelChannelId', 'ticketStaffRoleId', 'ticketCategoryId',
    'ticketClosedCategoryId', 'ticketPanelMessage', 'ticketButtonLabel',
    'maxTicketsPerUser', 'ticketLogsChannelId', 'ticketTranscriptChannelId',
    'logging',
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

    return router;
}

function canManageGuild(req, guildId) {
    const userGuilds = req.session.guilds || [];
    const guild = userGuilds.find(g => g.id === guildId);
    if (!guild) return false;
    return (BigInt(guild.permissions) & BigInt(MANAGE_GUILD)) === BigInt(MANAGE_GUILD);
}
