export const changelog = [
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
    new:     '🆕',
    changed: '✏️',
    fixed:   '🐛',
    removed: '🗑️',
};
