// ccStoreItems.js — the CC store catalog and the store room.
// The store room (a channel in STORE_CATEGORY_ID) is run by src/services/cc/storeChannel.js and the
// commands by src/commands/Games/store.js; buying is src/services/cc/ccStoreService.js.
//
// Item fields:
//   id           unique, lowercase, no spaces (used in commands and in the member's inventory)
//   name         shown in the store
//   emoji        optional
//   description  shown in the store
//   price        CC, a positive whole number (for a custom role: the price of one month)
//   type         'role'        gives a role to the buyer (bought once): `roleId`, or `roleKey: 'trader'`
//                              for the trader role the bot made (src/services/cc/traderRoleService.js)
//                'item'        goes to the member's inventory (`ccInventory`), can stack up to `maxOwned`
//                'luckbox'     opened right away: a random prize from `luckBoxPrizes` below
//                'boost'       XP ×2 for `minutes` on `sources` ('chat', 'voice'); buying more adds time
//                'forecast'    shows privately which way every bourse asset moves at the next hour
//                'custom_role' a role the buyer names (with a colour and an icon), paid every month:
//                              `kind` 'personal' (the buyer only) or 'friends' (the buyer, the leader,
//                              invites up to `maxMembers - 1` others with `رولي انفايت @member`)
//   maxOwned     for type 'item', optional (default: no limit)

// Shown in the store by price, cheapest first, with the custom roles always at the bottom
// (ccStoreService.js sorts them; this list is kept in the same order).
// Prices raised 20% at the owner's request (report #205); custom roles bought before keep renewing at
// the price they were bought at.
export const ccStoreItems = [
    { id: 'xp_boost', name: 'بوست XP ×2', emoji: '⚡', description: 'ضعف XP الشات لمدة ساعة', price: 1200, type: 'boost', sources: ['chat'], minutes: 60 },
    { id: 'luck_box', name: 'صندوق حظ', emoji: '🎁', description: 'جواه جايزة عشوائية: CC (لحد 50,000)، بوست، تنبؤ بورصة، رول تاجر، صندوق تاني ببلاش، أو نادراً شهر ببلاش لرول مميزة', price: 1800, type: 'luckbox' },
    { id: 'level_boost', name: 'لفل ×2', emoji: '🚀', description: 'ضعف XP الشات والفويس لمدة ساعة', price: 1800, type: 'boost', sources: ['chat', 'voice'], minutes: 60 },
    { id: 'trader_role', name: 'رول تاجر', emoji: '💼', description: 'رول التاجر، فوق رول Level 100', price: 3000, type: 'role', roleKey: 'trader' },
    { id: 'bourse_forecast', name: 'تنبؤ البورصة', emoji: '🔮', description: 'تعرف سعر كل أصل في البورصة الساعة الجاية بالظبط، بيوصلك في الخاص', price: 7800, type: 'forecast' },
    { id: 'custom_role', name: 'رول مميزة باسمك', emoji: '🎨', description: 'رول ليك لوحدك، بتختار اسمها ولونها وأيقونتها ・ في الشهر', price: 9000, type: 'custom_role', kind: 'personal', maxMembers: 1 },
    { id: 'friends_role', name: 'رول ليك ولصحابك', emoji: '👥', description: 'رول ليك و15 من صحابك وإنت المسؤول، بتبعتلهم `رولي انفايت` ・ في الشهر', price: 30000, type: 'custom_role', kind: 'friends', maxMembers: 16 },
];

// Other servers (not HOME_GUILD_ID in src/config/homeGuild.js) keep the store as it was before these
// items: these samples, in trial mode (buying only previews). They get no updates unless the owner asks.
export const ccStoreDemoItems = [
    { id: 'demo_vip', name: 'رتبة VIP', emoji: '💎', description: 'رتبة مميزة بلون خاص فوق الأعضاء', price: 5000, type: 'item', maxOwned: 1 },
    { id: 'demo_color', name: 'لون مميز للاسم', emoji: '🎨', description: 'تختار لون اسمك في السيرفر', price: 1500, type: 'item', maxOwned: 1 },
    { id: 'demo_xp_boost', name: 'بوست XP ×2', emoji: '⚡', description: 'ضعف الـ XP لمدة ساعة', price: 800, type: 'item', maxOwned: 5 },
    { id: 'demo_box', name: 'صندوق حظ', emoji: '🎁', description: 'جواه جايزة عشوائية', price: 300, type: 'item', maxOwned: 10 },
];

// The luck box: one prize is drawn by `weight` (the chance is weight / total, here out of 1,000).
// Rebalanced at the owner's request (report #179), then given more kinds of prizes. On average it gives
// back about 1,300 CC (counting the trader role fallback and the free second box), less than its 1,800
// price, so buying boxes doesn't create CC. A prize is one of:
//   { cc }                        that much CC
//   { boost: <'boost' item id> }  that boost, as if bought
//   { forecast: true }            the bourse forecast, as if bought (sent in DM)
//   { role: <'role' item id> }    that role; a member who already has it gets `fallbackCC` instead
//   { extraBox: true }            a second box opened right away, for free (never another free box)
//   { customRole: <'custom_role' item id> }  one free month of that role, kept in the inventory and used
//                                 from the store (CUSTOM_ROLE_VOUCHERS below)
export const luckBoxPrizes = [
    { cc: 500, weight: 250 },
    { cc: 1000, weight: 210 },
    { cc: 1500, weight: 150 },
    { cc: 2000, weight: 80 },
    { cc: 3000, weight: 45 },
    { cc: 5000, weight: 25 },
    { cc: 7500, weight: 12 },
    { cc: 10000, weight: 6 },
    { cc: 25000, weight: 2 },
    { cc: 50000, weight: 1 },
    { boost: 'xp_boost', weight: 100 },
    { boost: 'level_boost', weight: 60 },
    { role: 'trader_role', fallbackCC: 3000, weight: 20 },
    { extraBox: true, weight: 19 },
    { forecast: true, weight: 15 },
    { customRole: 'custom_role', weight: 4 },
    { customRole: 'friends_role', weight: 1 },
];

// The inventory entry of a free custom role month won in the luck box, one per custom role item.
export const CUSTOM_ROLE_VOUCHERS = {
    custom_role: { id: 'custom_role_voucher', itemId: 'custom_role', name: 'شهر مجاني لرول مميزة باسمك', emoji: '🎟️' },
    friends_role: { id: 'friends_role_voucher', itemId: 'friends_role', name: 'شهر مجاني لرول ليك ولصحابك', emoji: '🎫' },
};
export const CUSTOM_ROLE_VOUCHER = CUSTOM_ROLE_VOUCHERS.custom_role;
/** The free month voucher of a custom role item, or null. */
export const voucherFor = (itemId) => CUSTOM_ROLE_VOUCHERS[itemId] || null;

// Custom roles (type 'custom_role'): paid every `days` days from the leader's CC. When the leader can't
// pay, the role stays `graceDays` more days; then the bot deletes it. `رولي الغي` stops the renewal and
// the role goes at the end of the paid month. The bot creates these roles (and only these) with no
// permissions, just above the trader role, and deletes them when they end.
export const customRoleSettings = {
    days: 30,
    graceDays: 3,
    // A DM to the leader this many days before the renewal.
    remindDaysBefore: 3,
    // How long an invite (`رولي انفايت`) can be accepted.
    inviteHours: 24,
    maxNameLength: 32,
    // Names that look like staff roles are refused (lowercase, compared inside the name).
    blockedNameWords: ['admin', 'mod', 'owner', 'staff', 'manager', 'support', 'helper', 'dev', 'bot',
        'ادمن', 'أدمن', 'اداره', 'إدارة', 'ادارة', 'مشرف', 'مالك', 'اونر', 'أونر', 'ستاف', 'مدير', 'سبورت', 'هيلبر', 'بوت'],
    checkEveryMinutes: 30,
};

// The trader role (item `trader_role`). The owner asked the bot to make it once, just above the
// Level 100 role (src/services/cc/traderRoleService.js); if it is deleted later it is not made again.
export const traderRoleSettings = {
    name: '💼 تاجر',
    color: '#c9a227',
    aboveLevel: 100,
};

export const ccStoreSettings = {
    // Real buying (takes CC, gives the item), in our server only (src/config/homeGuild.js). Other servers
    // stay as they were: trial mode with the old samples.
    open: true,
    // Trial mode (while `open` is false, and always in other servers): the store shows its items, but
    // buying one only checks the balance and shows the receipt: no CC is taken and nothing is given.
    trial: true,
    maxQuantity: 10,
};

// The store room: the bot creates a text channel in this category (and reuses it after restarts).
// Only store commands can be written there, and the store panel is sent again (and pinned) every
// `repostEvery` messages so it is always near the bottom.
export const STORE_CATEGORY_ID = '1547310323994853438';
export const STORE_CHANNEL_NAME = '🛒・المتجر';
export const storeRoomSettings = {
    repostEvery: 5,
    // Seconds between two messages of the same member in the store room.
    slowmodeSeconds: 3,
};
