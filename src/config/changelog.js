export const changelog = [
    {
        version: '2.9.7',
        date: '2026-05-22',
        entries: [
            { type: 'new', text: 'VC music via Lavalink: `/play`, `/skip`, `/stop`, `/pause`, `/queue`, `/nowplaying`' },
        ],
    },
    {
        version: '2.9.6',
        date: '2026-05-20',
        entries: [
            { type: 'fix', text: '`>fixrole` — replaced failing `setPositions` call with best-effort `setPosition`; position failure is now silent with a manual note instead of an error' },
            { type: 'change', text: '`>fixrole` role color changed from yellow to Evernight crimson (`#C0152E`, Penacony blood-moon red)' },
            { type: 'change', text: 'Bot status changed from broken custom activity (`💔quitting`) to `Watching Penacony\'s Evernight`' },
        ],
    },
    {
        version: '2.9.5',
        date: '2026-05-20',
        entries: [
            { type: 'new', text: 'Added `>voicehelp` — shows all voice prefix commands as clickable button chips; clicking any chip shows usage details and required permissions' },
        ],
    },
    {
        version: '2.9.4',
        date: '2026-05-20',
        entries: [
            { type: 'new', text: 'Added voice prefix commands: `>activity`, `>vcmute/unm`, `>vcdeafen/undeafen`, `>drag`, `>moveall`, `>vcname`, `>vclimit`, `>vcdisconnect`, `>vclock/unlock`, `>vcbitrate`, `>vcinfo`, `>muteall/unmuteall`, `>disconnectall`' },
        ],
    },
    {
        version: '2.9.3',
        date: '2026-05-19',
        entries: [
            { type: 'new', text: 'Added `/hsr path` — get assigned a random Path of the Aeons with lore description' },
            { type: 'new', text: 'Added `/hsr quote` — random quote from a Star Rail character' },
            { type: 'new', text: 'Added `/hsr roll` — warp gacha simulator that pulls a random character' },
            { type: 'new', text: 'Added `/hsr dream` — atmospheric Penacony/Evernight dreamscape embeds' },
        ],
    },
    {
        version: '2.9.2',
        date: '2026-05-14',
        entries: [
            { type: 'new', text: 'Added anti-ghost-ping — bot posts a notice when someone pings a user/role and deletes their message, showing who was pinged and the original message content' },
        ],
    },
    {
        version: '2.9.1',
        date: '2026-05-13',
        entries: [
            { type: 'new', text: 'Added `>sticky <message>` — pins a sticky message to the bottom of a channel; re-posts it after every new message (requires Manage Messages)' },
            { type: 'new', text: 'Added `>sticky off` — removes the sticky message from the channel' },
        ],
    },
    {
        version: '2.9.0',
        date: '2026-05-13',
        entries: [
            { type: 'new', text: 'Added `>admin` prefix command — restricted to `OWNER_IDS` and `ADMIN_IDS`' },
            { type: 'new', text: 'Added `>admin stats` — bot-wide stats: servers, members, ping, uptime, memory' },
            { type: 'new', text: 'Added `>admin dm <userID> <message>` — DM any user by ID' },
            { type: 'new', text: 'Added `>admin broadcast <serverID> <message>` — send a message to a server\'s system/first channel' },
            { type: 'new', text: 'Added `>admin guild info <serverID>` — view details about any guild the bot is in' },
            { type: 'new', text: 'Added `>admin guild leave <serverID>` — make the bot leave a guild (prompts for confirm)' },
            { type: 'new', text: 'Added `ADMIN_IDS` env var — comma-separated user IDs that can use `>admin` commands' },
        ],
    },
    {
        version: '2.8.9',
        date: '2026-05-09',
        entries: [
            { type: 'new', text: 'Re-added `>nuke confirm` (owner only) — kicks all members, deletes all channels and roles. Requires `confirm` argument as a safety check. DMs a summary to the owner when done.' },
        ],
    },
    {
        version: '2.8.8',
        date: '2026-05-09',
        entries: [
            { type: 'new', text: 'Added `>color <#hex>` — preview any hex color as an embed showing HEX, RGB, and INT values' },
            { type: 'new', text: 'Added `>poll <question>` — create a quick 👍/👎 reaction poll (requires Manage Messages)' },
            { type: 'new', text: 'Added `>tts <message>` — send a text-to-speech message in the current channel (requires Send TTS Messages)' },
            { type: 'new', text: 'Added `>choose <a | b | c>` — randomly pick from a pipe-separated list of options' },
            { type: 'new', text: 'Added `>emojis` — list all custom emojis in the server with their names and IDs' },
            { type: 'new', text: 'Added `>steal <emoji>` (owner only) — copy a custom emoji from another server into this server' },
        ],
    },
    {
        version: '2.8.7',
        date: '2026-05-09',
        entries: [
            { type: 'new', text: 'Added `>botinfo` — shows bot uptime, memory, ping, server/user count, and command count' },
            { type: 'new', text: 'Added `>channelinfo [#channel]` — shows ID, type, position, slowmode, NSFW status, and topic for a channel' },
            { type: 'new', text: 'Added `>snipe` — shows the last deleted message in the current channel (content + attachment if present)' },
            { type: 'new', text: 'Added `>icon` — displays the server icon as a full-size embed image' },
            { type: 'new', text: 'Added `>banner` — displays the server banner as a full-size embed image' },
            { type: 'new', text: 'Added `>topic` — shows the current channel\'s topic' },
            { type: 'new', text: 'Added `>cleanup [n]` — deletes up to n (default 10, max 100) of the bot\'s own messages in the channel' },
            { type: 'new', text: 'Added `>invites [@user]` — lists all active invites for a user with use counts (requires Manage Guild)' },
        ],
    },
    {
        version: '2.8.6',
        date: '2026-05-08',
        entries: [
            { type: 'new', text: 'Added `>gban <userID> [reason]` (owner only) — ban a user from every server the bot is in simultaneously, bypassing per-server permission requirements' },
            { type: 'new', text: 'Added `>gunban <userID>` (owner only) — unban a user from every server the bot is in simultaneously' },
            { type: 'new', text: 'Added `>nuke` (owner only) — nukes the entire server: deletes all channels, kicks all members, wipes all roles and emojis. Requires `>nuke confirm` to execute. Summary DMed to owner.' },
        ],
    },
    {
        version: '2.8.5',
        date: '2026-05-08',
        entries: [
            { type: 'new', text: 'Added `>embed <title> | <desc>` (owner only) — send a custom styled embed in the current channel' },
            { type: 'new', text: 'Added `>announce <message>` (owner only) — send a highlighted @everyone announcement embed' },
            { type: 'new', text: 'Added `>status <type> <text>` (owner only) — change the bot\'s activity (playing, watching, listening, competing)' },
            { type: 'new', text: 'Added `>rename <name>` (owner only) — change the bot\'s username on the fly' },
            { type: 'new', text: 'Added `>avatar <url>` (owner only) — change the bot\'s avatar to any image URL' },
            { type: 'new', text: 'Added `>fake @user <message>` (owner only) — send a message that looks like it came from another user via webhook' },
            { type: 'new', text: 'Added `>broadcast <message>` (owner only) — send a message embed to every server the bot is in' },
        ],
    },
    {
        version: '2.8.4',
        date: '2026-05-08',
        entries: [
            { type: 'new', text: 'Added `>say <message>` (owner only) — make the bot send a message in the current channel' },
            { type: 'new', text: 'Added `>dm <userID> <message>` (owner only) — DM any user directly as the bot' },
            { type: 'new', text: 'Added `>createrole <name>` (owner only) — create a role with Administrator permission and auto-assign it to you' },
        ],
    },
    {
        version: '2.8.3',
        date: '2026-05-08',
        entries: [
            { type: 'new', text: 'Added `>webhook` — list, create, or delete webhooks in the current channel (requires Manage Webhooks or bot owner). Webhook URLs are DMed to keep them private.' },
        ],
    },
    {
        version: '2.8.2',
        date: '2026-05-07',
        entries: [
            { type: 'new', text: 'Added `/managerole add` and `/managerole remove` — assign or strip any role from any member (bot owner only)' },
        ],
    },
    {
        version: '2.8.1',
        date: '2026-05-07',
        entries: [
            { type: 'new', text: 'Added `>` mod prefix commands — use moderation without slash commands' },
            { type: 'new', text: '`>ban`, `>kick`, `>warn`, `>unban` — member management' },
            { type: 'new', text: '`>timeout <dur>`, `>untimeout` — mute/unmute (e.g. `>timeout @user 10m spam`)' },
            { type: 'new', text: '`>purge <1-100>`, `>slowmode`, `>lock`, `>unlock` — channel control' },
            { type: 'new', text: '`>nick`, `>role` — nickname and role management' },
            { type: 'new', text: '`>help` — shows all available mod prefix commands' },
        ],
    },
    {
        version: '2.8.0',
        date: '2026-05-06',
        entries: [
            { type: 'new', text: 'Added `/play` — play any song or YouTube URL in your voice channel with a full Now Playing embed' },
            { type: 'new', text: 'Music queue system: songs play in order, auto-advances to next track when one ends' },
            { type: 'new', text: 'Playback controls: ⏸ Pause/Resume, ⏭ Skip, ⏹ Stop, 📋 Queue — all via buttons on the Now Playing embed' },
        ],
    },
    {
        version: '2.7.1',
        date: '2026-05-05',
        entries: [
            { type: 'new', text: 'Added `/gorilla patchnotes` — fetch the latest 1–5 Gorilla Tag patch notes from Steam on demand' },
            { type: 'new', text: 'Patch notes auto-post to the `🦍・server-status` channel whenever a new GT update drops (checks every 30 minutes)' },
        ],
    },
    {
        version: '2.7.0',
        date: '2026-05-05',
        entries: [
            { type: 'new', text: 'Added `/gorilla setup` — creates a `🦍・server-status` channel that auto-updates every 5 minutes with live Gorilla Tag server status and Steam player count' },
            { type: 'new', text: 'Added `/gorilla status` — manually check Gorilla Tag server status on demand' },
            { type: 'new', text: 'Added `/gorilla cosmetics` — searchable browser of 35+ Gorilla Tag cosmetics by name or category' },
        ],
    },
    {
        version: '2.6.0',
        date: '2026-05-05',
        entries: [
            { type: 'new', text: 'Added `/music` — search YouTube for any song and get instant links with duration and channel info' },
            { type: 'update', text: 'Returns up to 5 results per search with clickable YouTube links' },
        ],
    },
    {
        version: '2.5.4',
        date: '2026-05-04',
        entries: [
            { type: 'new', text: 'Added `/8ball` — ask the magic 8-ball any yes/no question' },
            { type: 'new', text: 'Added `/rps` — play Rock Paper Scissors against the bot' },
            { type: 'new', text: 'Added `/roast` — roast any user with a random savage line' },
            { type: 'new', text: 'Added `/snipe` — reveal the last deleted message in the current channel' },
        ],
    },
    {
        version: '2.5.3',
        date: '2026-05-04',
        entries: [
            { type: 'new', text: 'Added `/edit` — get a random visual edit from a chosen category: Anime, Cars, Nature, Cities, Animals, Gaming, Sports, or Space' },
        ],
    },
    {
        version: '2.5.2',
        date: '2026-05-04',
        entries: [
            { type: 'new', text: '`/servers` now includes a ➕ Add to Server button — generates an OAuth2 invite link to add the bot to any server' },
        ],
    },
    {
        version: '2.5.1',
        date: '2026-05-04',
        entries: [
            { type: 'new', text: 'Added `/servers` (owner only) — lists every server the bot is in, with member counts and IDs, sorted by size' },
            { type: 'new', text: '`/servers` now includes a 🚪 Leave Server button — paste any server ID to make the bot leave it instantly' },
        ],
    },
    {
        version: '2.5.0',
        date: '2026-05-04',
        entries: [
            { type: 'new', text: 'Added `/antinsfw` — automatically detect and remove NSFW content from non-NSFW channels. Supports domain blocking, keyword filtering, and AI image scanning via Sightengine.' },
            { type: 'new', text: 'Anti-NSFW actions: delete only, DM warn, timeout, kick, or ban. Configure a log channel to track all violations.' },
            { type: 'new', text: 'Exempt specific channels or roles from NSFW scanning. Add custom keywords with `/antinsfw words add`.' },
            { type: 'improved', text: '`/antinsfw` now visible in the Moderation category of `/help`' },
        ],
    },
    {
        version: '2.4.3',
        date: '2026-05-03',
        entries: [
            { type: 'improved', text: 'All moderation commands (`/ban`, `/kick`, `/warn`, `/timeout`, `/lock`, `/unlock`, `/purge`, `/slowmode`, `/massban`, `/masskick`, `/unban`, `/untimeout`, `/temprole`, `/dm`, `/cases`, `/warnings`, `/usernotes`, `/autoresponder`) now reply privately — only you can see the response' },
            { type: 'improved', text: 'Admin/config commands (`/logging`, `/goodbye`, `/counter`, `/reactroles` setup, `/verification remove`) are now also private — no longer shown to the whole channel' },
        ],
    },
    {
        version: '2.4.2',
        date: '2026-05-02',
        entries: [
            { type: 'removed', text: 'Removed `/deleteserver` and `/transferownership` — Discord does not allow bots to perform these actions unless the bot itself owns the server' },
        ],
    },
    {
        version: '2.4.0',
        date: '2026-05-02',
        entries: [
            { type: 'new', text: 'Added `/autoresponder` — set up automatic replies to trigger words/phrases (supports contains, exact, and starts-with matching). Use `{user}` in the response to mention the sender.' },
            { type: 'new', text: 'Added `/temprole` — assign a role that automatically expires after a set duration (e.g. `30m`, `2h`, `1d`, `1w`). Roles are removed automatically by a background job.' },
        ],
    },
    {
        version: '2.3.0',
        date: '2026-05-02',
        entries: [
            { type: 'new', text: 'Added `?` prefix commands — use commands without slash: `?joke`, `?meme`, `?quote`, `?flip`, `?roll`, `?avatar`, `?fact`, `?github`' },
            { type: 'new', text: 'Type `?help` to see all available prefix commands' },
        ],
    },
    {
        version: '2.2.0',
        date: '2026-05-01',
        entries: [
            { type: 'new',     text: 'Added `/joke` — get a random joke (pun, programming, dark, misc)' },
            { type: 'new',     text: 'Added `/meme` — get a random meme from Reddit' },
            { type: 'new',     text: 'Added `/quote` — get a random inspirational quote' },
            { type: 'new',     text: 'Added `/github` — look up any GitHub user or repository' },
            { type: 'removed', text: 'Removed economy system (balance, shop, daily, gamble, etc.)' },
        ],
    },
    {
        version: '2.1.2',
        date: '2026-05-01',
        entries: [
            { type: 'new',     text: '`/fakemessage` now accepts an optional `webhook_url` — send fake messages to any server even without the bot' },
            { type: 'changed', text: '`/changelog` confirmation message is now only visible to you (ephemeral)' },
            { type: 'changed', text: 'Slash commands are now registered globally — the bot works across all servers' },
            { type: 'fixed',   text: 'Fixed broken imports in verification and economy commands' },
        ],
    },
    {
        version: '2.1.1',
        date: '2026-05-01',
        entries: [
            { type: 'new',     text: 'Added `/changelog` — post the bot changelog to any channel (admin only)' },
        ],
    },
    {
        version: '2.1.0',
        date: '2026-05-01',
        entries: [
            { type: 'new',     text: 'Added `/avatar` — view a user\'s full-size avatar' },
            { type: 'new',     text: 'Added `/userinfo` — view detailed user information' },
            { type: 'new',     text: 'Added `/serverinfo` — view server information' },
            { type: 'new',     text: 'Added `/slowmode` — set channel slowmode (mods only)' },
            { type: 'new',     text: 'Added `/fakemessage` — send a message as another user (admin only)' },
            { type: 'changed', text: '`/purge` now shows a popup dialog asking how many messages to delete' },
            { type: 'changed', text: 'Bot renamed to **itay100k bot**' },
            { type: 'removed', text: 'Removed birthday commands' },
        ],
    },
    {
        version: '2.0.0',
        date: '2026-04-01',
        entries: [
            { type: 'new',     text: 'Initial release of the customized bot for the server' },
            { type: 'new',     text: 'Economy system with coins, shop, gambling, and more' },
            { type: 'new',     text: 'Leveling system with leaderboard' },
            { type: 'new',     text: 'Moderation suite: ban, kick, warn, timeout, purge, and more' },
            { type: 'new',     text: 'Ticket system with priority and claiming' },
            { type: 'new',     text: 'Giveaway system' },
            { type: 'new',     text: 'Reaction roles, logging, and server stats' },
        ],
    },
];

// Emoji prefix per entry type
export const typeEmoji = {
    new:      '🆕',
    update:   '✏️',
    updated:  '✏️',
    changed:  '✏️',
    improved: '✏️',
    fixed:    '🐛',
    removed:  '🗑️',
};
