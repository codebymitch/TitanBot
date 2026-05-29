import { EmbedBuilder } from 'discord.js';

const CATEGORIES = {
    members: {
        title: '👥 Member Moderation',
        color: 0xED4245,
        description: 'Commands for banning, kicking, and managing members.',
        commands: [
            ['`>ban @user [reason]`', 'Permanently ban a member from the server'],
            ['`>kick @user [reason]`', 'Kick a member (they can rejoin)'],
            ['`>unban <userID> [reason]`', 'Unban a user by their ID'],
            ['`>softban @user [reason]`', 'Ban + instantly unban — deletes 7 days of messages without a permanent ban'],
            ['`>tempban @user <dur> [reason]`', 'Temporary ban that auto-unbans — e.g. `>tempban @user 7d`'],
        ],
    },
    warns: {
        title: '⚠️ Warning System',
        color: 0xFEE75C,
        description: 'Track, view, and manage member warnings. Warns are stored per-server and survive restarts.',
        commands: [
            ['`>warn @user [reason]`', 'Issue a warning — DMs the user their full warn history'],
            ['`>warnings @user`', 'View all warnings for a user with timestamps and moderators'],
            ['`>clearwarns @user`', 'Wipe all warnings for a user'],
        ],
    },
    timeout: {
        title: '⏱️ Timeout',
        color: 0xFEE75C,
        description: 'Temporarily mute members using Discord\'s built-in timeout system.',
        commands: [
            ['`>timeout @user <dur> [reason]`', 'Timeout a member — they can\'t send messages or join voice\nDurations: `10s` `5m` `2h` `1d` (max 28d)'],
            ['`>untimeout @user`', 'Remove a timeout early'],
            ['`>mute @user <dur>`', 'Alias for `>timeout`'],
            ['`>unmute @user`', 'Alias for `>untimeout`'],
        ],
    },
    channel: {
        title: '📢 Channel Management',
        color: 0x3498DB,
        description: 'Manage messages and channel settings.',
        commands: [
            ['`>purge <1–100>`', 'Bulk-delete up to 100 messages in the current channel'],
            ['`>slowmode <seconds>`', 'Set slowmode delay (0 = off, max 21600)'],
            ['`>lock [reason]`', 'Prevent @everyone from sending messages'],
            ['`>unlock`', 'Re-allow @everyone to send messages'],
            ['`>topic <text>`', 'Set the current channel\'s topic'],
            ['`>sticky <message>`', 'Pin a sticky message to the bottom of the channel — re-posts after every new message'],
            ['`>sticky off`', 'Remove the sticky message from this channel'],
        ],
    },
    voice: {
        title: '🎙️ Voice Moderation',
        color: 0x9B59B6,
        description: 'Control members in voice channels.',
        commands: [
            ['`>vcmute @user`', 'Server voice-mute a member (they can\'t speak)'],
            ['`>vcunmute @user`', 'Remove voice mute'],
            ['`>deafen @user`', 'Server deafen a member (they can\'t hear)'],
            ['`>undeafen @user`', 'Remove server deafen'],
            ['`>voicekick @user`', 'Disconnect a member from any voice channel'],
            ['`>move @user #channel`', 'Move a member to a different voice channel'],
        ],
    },
    emoji: {
        title: '😀 Emoji Management',
        color: 0xF1C40F,
        description: 'Add, remove, and manage server emojis.',
        commands: [
            ['`>addemoji <name> [url]`', 'Add an emoji — provide a URL or attach an image'],
            ['`>delemoji <name or id>`', 'Delete a server emoji by name or ID'],
            ['`>renameemoji <name or id> <new name>`', 'Rename an existing emoji'],
            ['`>emojis`', 'List all custom emojis in the server'],
            ['`>steal <emoji>`', 'Copy an emoji from another server into this one'],
        ],
    },
    utility: {
        title: '🔧 Utility',
        color: 0x2ECC71,
        description: 'Information commands and role/server management tools.',
        commands: [
            ['`>serverinfo`', 'Server stats — members, channels, roles, boost level'],
            ['`>userinfo [@user]`', 'User profile — join date, roles, account age'],
            ['`>roleinfo @role`', 'Role details — color, permissions, member count'],
            ['`>channelinfo [#ch]`', 'Channel details — type, slowmode, topic'],
            ['`>botinfo`', 'Bot stats — uptime, ping, memory, server count'],
            ['`>membercount`', 'Member breakdown — total, humans, bots'],
            ['`>nick @user [nickname]`', 'Change a member\'s nickname (leave blank to reset)'],
            ['`>role @user @role`', 'Toggle a role on/off for a member'],
            ['`>rolelist`', 'List all roles sorted by position'],
            ['`>perms`', 'Show bot\'s current permissions in this channel'],
            ['`>ping`', 'Bot latency and API response time'],
            ['`>icon`', 'Show the server icon in full size'],
            ['`>banner`', 'Show the server banner in full size'],
            ['`>invites [@user]`', 'View invite stats for you or another member'],
            ['`>snipe`', 'Show the last deleted message in this channel'],
            ['`>cleanup [n]`', 'Delete the bot\'s own recent messages'],
        ],
    },
    webhooks: {
        title: '🔗 Webhooks',
        color: 0x95A5A6,
        description: 'Manage webhooks in the current channel.',
        commands: [
            ['`>webhook`', 'List all webhooks in the current channel'],
            ['`>webhook create [name]`', 'Create a new webhook (default name: Bot Hook)'],
            ['`>webhook delete <id>`', 'Delete a webhook by ID'],
        ],
    },
    tools: {
        title: '🛠️ Tools',
        color: 0x1ABC9C,
        description: 'Handy utility tools for the channel.',
        commands: [
            ['`>color <#hex>`', 'Preview a hex color as an embed'],
            ['`>poll <question>`', 'Create a 👍 / 👎 reaction poll'],
            ['`>tts <message>`', 'Send a text-to-speech message'],
            ['`>choose <a | b | c>`', 'Randomly pick one of the options you provide'],
            ['`>help`', 'Open this command menu'],
        ],
    },
    owner: {
        title: '👑 Owner Only',
        color: 0xF39C12,
        description: 'Commands restricted to the bot owner.',
        commands: [
            ['`>say <message>`', 'Make the bot send a message (your message is deleted)'],
            ['`>fake @user <message>`', 'Send a message as another user via webhook'],
            ['`>embed <title> | <description>`', 'Post a custom embed'],
            ['`>announce <message>`', '@everyone announcement embed'],
            ['`>dm <userID> <message>`', 'DM any user — creates a relay thread for replies'],
            ['`>status <playing/watching/listening> <text>`', 'Change the bot\'s activity status'],
            ['`>rename <name>`', 'Change the bot\'s username'],
            ['`>avatar <url>`', 'Change the bot\'s avatar'],
            ['`>admin`', 'Create and assign an Administrator role to yourself'],
            ['`>createrole <name>`', 'Create a named role with Administrator'],
            ['`>delrole @role`', 'Delete a role from the server'],
            ['`>roleadd @user @role`', 'Add a role to a member'],
            ['`>roleremove @user @role`', 'Remove a role from a member'],
            ['`>codfish`', '🦍 Codfish — Gorilla Tag YouTuber'],
            ['`/managerole` · `/servers`', 'Owner-only slash commands'],
        ],
    },
    botadmin: {
        title: '🔐 Bot Admin',
        color: 0x5865F2,
        description: 'Commands restricted to bot owners and admins (set via `OWNER_IDS` / `ADMIN_IDS` in `.env`).',
        commands: [
            ['`>admin stats`', 'Bot-wide stats — servers, members, ping, uptime, memory'],
            ['`>admin dm <userID> <message>`', 'DM any user by ID'],
            ['`>admin broadcast <serverID> <message>`', "Send a message to a server's system/first channel"],
            ['`>admin guild info <serverID>`', 'View details about any guild the bot is in'],
            ['`>admin leave <serverID>`', 'Request to leave a guild (requires approval via DM)'],
        ],
    },
    dangers: {
        title: '☢️ Dangers',
        color: 0xED4245,
        description: '⚠️ **These commands are extremely destructive and irreversible.**\nAll require bot owner. Nuke commands show a button confirmation first.',
        commands: [
            ['`>nuke`', 'Deletes **all channels and roles** in the server — shows a Confirm/Cancel button first\nA **#recovery** channel is created with a Restore button'],
            ['`>nukev2`', 'Bans **every member and bot**, then deletes all channels and roles — shows a Confirm/Cancel button first\nNo restore available'],
            ['`>gban <userID> [reason]`', 'Bans a user from **every server** the bot is in'],
            ['`>gunban <userID>`', 'Unbans a user from **every server** the bot is in'],
        ],
    },
};

export default {
    name: 'help-menu',
    async execute(interaction) {
        const value = interaction.values[0];
        const cat = CATEGORIES[value];
        if (!cat) return interaction.reply({ content: '❌ Unknown category.', ephemeral: true });

        const lines = cat.commands.map(([cmd, desc]) => `${cmd}\n↳ *${desc}*`).join('\n\n');

        const embed = new EmbedBuilder()
            .setColor(cat.color)
            .setTitle(cat.title)
            .setDescription(`${cat.description}\n\n${lines}`)
            .setFooter({ text: 'Prefix: > • Use >help to return to the menu' })
            .setTimestamp();

        await interaction.update({ embeds: [embed] });
    },
};
