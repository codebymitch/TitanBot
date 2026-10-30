// storeUi.js — the store's embeds and buttons, shared by the `store` command
// (src/commands/Games/store.js), the store room panel (storeChannel.js) and its buttons
// (src/interactions/buttons/store/storePanel.js). Plain embed objects so the emojis stay.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { CC, ccEmbed, formatCC } from '../../config/cc.js';
import { ccStoreItems, ccStoreDemoItems, ccStoreSettings, storeRoomSettings, customRoleSettings, CUSTOM_ROLE_VOUCHERS, voucherFor } from '../../config/store/ccStoreItems.js';
import { isHomeGuild } from '../../config/homeGuild.js';
import { storeMode, storeCatalog, buyItem } from './ccStoreService.js';
import { forecastEmbed } from './bourseUi.js';

export const STORE_BUTTON_PREFIX = 'storepanel';
// The footer of the panel's commands card; it marks the panel so a restart edits it instead of posting a new one.
export const STORE_PANEL_FOOTER = '📌 أوامر المتجر بس هنا ・ أي رسالة تانية بتتمسح';
// Footers of older panels, so they are still found and edited.
const OLD_PANEL_FOOTERS = [`🛒 متجر ${CC.short} • الرسالة دي بتنزل تاني كل ${storeRoomSettings.repostEvery} رسايل`];
const PANEL_COMMANDS_COLOR = 0x80848e;
const TRIAL_LINE = '🧪 **المتجر تجريبي دلوقتي**: الشراء بيتجرب بس، ومفيش CC بيتخصم ولا حاجة بتتسلم.';
const CLOSED_LINE = '🔒 **المتجر مقفول دلوقتي**، هيفتح قريب.';

// Shown as cards side by side (inline fields, 3 per row). Each line starts with Arabic and never
// mixes a command with its explanation, so Discord doesn't reorder the words.
export const STORE_COMMANDS = [
    ['🛍️ متجر', 'يفتح المتجر بالقايمة والزراير'],
    ['🛒 متجر 1', 'تشتري المنتج رقم 1 (أو اكتب اسمه)'],
    ['🎒 مخزني', 'الحاجات اللي اشتريتها'],
    ['💰 رصيد', 'تعرف رصيدك'],
    ['🏆 توب cc', 'ترتيب السيرفر'],
    ['🔢 متجر 1 3', 'تشتري 3 قطع مرة واحدة'],
    ['📈 اسعار', 'أسعار البورصة'],
    ['💵 شراء عربية', 'تشتري من البورصة (أو استثمار)'],
    ['💼 ممتلكاتي', 'اللي معاك في البورصة'],
];

// Only in our server (src/config/homeGuild.js), where the custom roles are sold.
const CUSTOM_ROLE_COMMANDS = [
    ['🎨 رولي', 'الرول المميزة بتاعتك'],
    ['📨 رولي انفايت @عضو', 'تضيف صاحبك لرولك'],
    ['🚪 رولي اخرج', 'تخرج من رول صحابك'],
];

// The short commands card under the panel (the full list is in ❓ المساعدة).
const PANEL_COMMANDS = [
    ['متجر', 'المنتجات'],
    ['متجر 1', 'تشتري منتج'],
    ['مخزني', 'مشترياتك'],
];

export function isStorePanelFooter(text) {
    return text === STORE_PANEL_FOOTER || OLD_PANEL_FOOTERS.includes(text);
}

/** The commands as a header field plus one card (inline field) per command. */
export function commandFields(header = 'اكتب الأمر هنا في الروم 👇', guildId = null) {
    const commands = isHomeGuild(guildId) ? [...STORE_COMMANDS, ...CUSTOM_ROLE_COMMANDS] : STORE_COMMANDS;
    return [
        { name: '⌨️ الأوامر', value: header },
        ...commands.map(([name, value]) => ({ name, value, inline: true })),
    ];
}

function modeLine(mode) {
    if (mode === 'trial') return TRIAL_LINE;
    return mode === 'closed' ? CLOSED_LINE : '';
}

function itemLabel(item) {
    return `${item.emoji ? `${item.emoji} ` : ''}${item.name}`;
}

/** `🌀 7,500` or `🌀 7,500 في الشهر` for a monthly item. */
function priceText(item) {
    return `${CC.emoji} ${item.price.toLocaleString('en-US')}${item.type === 'custom_role' ? ' في الشهر' : ''}`;
}

/** One full-width field per item: `1 ・ 💎 رتبة VIP`, then its price and description on their own lines. */
function itemFields(items) {
    if (!items.length) return [{ name: '🛍️ المنتجات', value: '> لسه مفيش منتجات، هتتضاف قريب.' }];
    return items.slice(0, 20).map((item, index) => ({
        name: `${index + 1} ・ ${itemLabel(item)}`.slice(0, 256),
        value: [`> السعر: ${priceText(item)}`, `> ${item.description || '—'}`].join('\n').slice(0, 1024),
    }));
}

function modeTag(mode) {
    if (mode === 'trial') return '🧪 **تجريبي** ・ الشراء بيتجرب بس ومفيش CC بيتخصم';
    return mode === 'closed' ? CLOSED_LINE : '';
}

/**
 * The pinned panel of the store room: a card with the items, a small grey card with the main
 * commands under it, then the buy menu and the buttons.
 */
export function buildStorePanel(guild, { settings = ccStoreSettings, balance = null } = {}) {
    const mode = storeMode(settings, guild?.id);
    const items = storeCatalog(settings, { guildId: guild?.id });
    // `متجر` shows the member's own balance on top (report #174); the pinned panel is for everyone, so none.
    const top = [balance === null ? '' : `💰 رصيدك: ${formatCC(balance)}`, modeTag(mode)].filter(Boolean).join('\n');
    const itemsEmbed = ccEmbed(`🛒 متجر ${CC.name}`, top, { fields: itemFields(items) });
    const commandsEmbed = ccEmbed('⌨️ الأوامر', '', {
        color: PANEL_COMMANDS_COLOR,
        fields: PANEL_COMMANDS.map(([name, value]) => ({ name, value, inline: true })),
    });
    commandsEmbed.footer = { text: STORE_PANEL_FOOTER };

    return {
        content: '',
        embeds: [itemsEmbed, commandsEmbed],
        components: storePanelComponents(items, mode),
        allowedMentions: { parse: [] },
    };
}

function storePanelComponents(items, mode) {
    const rows = [];
    if (items.length && mode !== 'closed') {
        rows.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`${STORE_BUTTON_PREFIX}:buy`)
                .setPlaceholder(mode === 'trial' ? '🧪 اختار منتج تجرب تشتريه...' : '🛍️ اختار منتج تشتريه...')
                .addOptions(items.slice(0, 25).map((item, index) => ({
                    label: `${index + 1}. ${item.name}`.slice(0, 100),
                    description: `${item.price.toLocaleString('en-US')} ${CC.short}${item.type === 'custom_role' ? ' في الشهر' : ''} ・ ${item.description || ''}`.slice(0, 100),
                    value: item.id,
                    ...(item.emoji ? { emoji: item.emoji } : {}),
                }))),
        ));
    }
    rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${STORE_BUTTON_PREFIX}:balance`).setLabel('رصيدي').setEmoji('💰').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`${STORE_BUTTON_PREFIX}:inventory`).setLabel('مخزني').setEmoji('🎒').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`${STORE_BUTTON_PREFIX}:top`).setLabel('توب CC').setEmoji('🏆').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`${STORE_BUTTON_PREFIX}:help`).setLabel('المساعدة').setEmoji('❓').setStyle(ButtonStyle.Secondary),
    ));
    return rows;
}

export function storeHelpEmbed(guildId = null) {
    const line = modeLine(storeMode(undefined, guildId));
    return ccEmbed('❓ ازاي تستخدم المتجر', [
        '🛒 تقدر تشتري من القايمة اللي في الرسالة المثبتة، وبعدها تأكد بزرار ✅.',
        ...(line ? ['', line] : []),
    ].join('\n'), {
        fields: [
            ...commandFields('ودي الأوامر اللي تقدر تكتبها 👇', guildId),
            { name: `💡 ازاي تكسب ${CC.short}`, value: '🎮 تكسب في الألعاب\n📈 لما تعلى لفل\n🔁 لما حد يحوّلك' },
        ],
    });
}

/** `مخزني`: what the member owns. */
export function inventoryEmbed(user, inventory = {}) {
    const known = [...ccStoreItems, ...ccStoreDemoItems, ...Object.values(CUSTOM_ROLE_VOUCHERS)];
    const lines = Object.entries(inventory)
        .filter(([, count]) => Number(count) > 0)
        .map(([id, count]) => {
            const item = known.find((entry) => entry.id === id);
            return `${item?.emoji || '📦'} **${item?.name || id}** × ${count}`;
        });
    return ccEmbed('🎒 مخزني', `${user}\n\n${lines.join('\n') || 'مخزنك فاضي لسه. اكتب `متجر` وشوف المنتجات 🛍️'}`, {
        thumbnail: user.displayAvatarURL?.() || null,
    });
}

/** The "are you sure?" step before buying. The buttons only work for `userId`. */
export function confirmPurchasePayload(item, quantity, userId, balance, mode = storeMode(), { vouchers = 0 } = {}) {
    // A free month won in the luck box pays the first month of that custom role (report #179).
    const free = Boolean(voucherFor(item.id)) && vouchers > 0;
    const cost = free ? 0 : item.price * quantity;
    const after = balance - cost;
    const embed = ccEmbed(`${mode === 'trial' ? '🧪 ' : ''}تأكيد الشراء`, [
        `${itemLabel(item)}${quantity > 1 ? ` × ${quantity}` : ''}`,
        `> ${item.description || '—'}`,
        '',
        free
            ? `${voucherFor(item.id).emoji} أول شهر **ببلاش** من صندوق الحظ، وبعدها ${formatCC(item.price)} كل ${customRoleSettings.days} يوم من رصيدك`
            : `💵 السعر: ${formatCC(cost)}${item.type === 'custom_role' ? ` (كل ${customRoleSettings.days} يوم، بيتجدد من رصيدك)` : ''}`,
        `💰 رصيدك: ${formatCC(balance)}`,
        after >= 0 ? `📉 بعد الشراء: ${formatCC(after)}` : `❌ ناقصك ${formatCC(-after)}`,
        ...(mode === 'trial' ? ['', TRIAL_LINE] : []),
    ].join('\n'));
    const isRole = item.type === 'custom_role';
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${STORE_BUTTON_PREFIX}:confirm:${item.id}:${quantity}:${userId}`)
            .setLabel(isRole ? 'اختار الاسم واللون والأيقونة' : mode === 'trial' ? 'تجربة الشراء' : 'تأكيد')
            .setEmoji(isRole ? '🎨' : '✅')
            .setStyle(ButtonStyle.Success)
            .setDisabled(after < 0),
        new ButtonBuilder().setCustomId(`${STORE_BUTTON_PREFIX}:cancel:${userId}`).setLabel('إلغاء').setEmoji('✖️').setStyle(ButtonStyle.Secondary),
    );
    return { embeds: [embed], components: [row], allowedMentions: { parse: [] } };
}

const FAILURE_TEXT = {
    closed: CLOSED_LINE,
    not_found: '❌ المنتج ده مش موجود. اكتب `متجر` وشوف الأرقام.',
    bad_quantity: `❌ العدد لازم يكون من 1 لـ ${ccStoreSettings.maxQuantity} (والرتب والصندوق والتنبؤ قطعة واحدة بس).`,
    owned: '❌ الرتبة دي معاك أصلاً.',
    max_owned: '❌ وصلت لأقصى عدد تقدر تملكه من المنتج ده.',
    role_failed: '❌ معرفتش أديك الرتبة، ورجعتلك الـ CC بتاعتك. كلم الإدارة.',
    role_missing: '❌ الرتبة دي مش موجودة في السيرفر دلوقتي. كلم الإدارة.',
    deliver_failed: '❌ حصلت مشكلة ومعرفتش أسلمك المنتج، ورجعتلك الـ CC بتاعتك.',
    use_form: '🎨 الرول دي بتتشرى من زرار المتجر عشان تختار اسمها ولونها.',
    has_role: '❌ معاك رول من النوع ده أصلاً. اكتب `رولي` تشوفها.',
    bad_color: '❌ اللون مش مفهوم. اكتب لون زي `#ff0000` أو `احمر`.',
    empty: '❌ لازم تكتب اسم للرول.',
    too_long: `❌ اسم الرول لازم يكون ${customRoleSettings.maxNameLength} حرف أو أقل.`,
    link: '❌ اسم الرول مينفعش يكون فيه منشن أو لينك.',
    staff_name: '❌ الاسم ده شبه رتب الإدارة، اختار اسم تاني.',
    taken: '❌ فيه رتبة بالاسم ده أصلاً، اختار اسم تاني.',
    create_failed: '❌ معرفتش أعمل الرول، ورجعتلك الـ CC بتاعتك. كلم الإدارة.',
};

export function purchaseFailureText(result) {
    if (result.reason === 'no_cc') return `❌ رصيدك ${formatCC(result.balance ?? 0)} مش كفاية.`;
    return FAILURE_TEXT[result.reason] || '❌ حصلت مشكلة، جرب تاني.';
}

const timestamp = (ms) => `<t:${Math.floor(ms / 1000)}:R>`;

/** One luck box prize, as a line under the receipt. */
function prizeLine(prize) {
    const item = (id) => ccStoreItems.find((entry) => entry.id === id);
    if (prize.extraBox) return '🎁 الصندوق طلعلك **صندوق تاني ببلاش**! اتفتح على طول:';
    if (prize.hadRole) return `🎉 الصندوق طلعلك **${item(prize.role)?.name || 'رول'}**، وهي معاك أصلاً، فخدت بدالها **${formatCC(prize.cc)}**!`;
    if (prize.roleId) return `${item(prize.role)?.emoji || '🎉'} الصندوق طلعلك **${item(prize.role)?.name || 'رول'}**، واتضافتلك!`;
    if (prize.cc) return `${prize.cc >= 25000 ? '💎 **جاكبوت!** ' : ''}🎉 الصندوق طلعلك **${formatCC(prize.cc)}**!`;
    if (prize.customRole) {
        const role = item(prize.customRole);
        return `${voucherFor(prize.customRole)?.emoji || '🎟️'} **نادرة!** الصندوق طلعلك **شهر ببلاش لـ${role?.name || 'رول مميزة'}**! اكتب \`متجر\` واختار ${role?.emoji || ''} ${role?.name || ''} وقت ما تحب.`;
    }
    if (prize.boost) return `🎉 الصندوق طلعلك **${item(prize.boost)?.name || 'بوست'}** لمدة ساعة!`;
    if (prize.forecast) return '🔮 الصندوق طلعلك **تنبؤ البورصة**!';
    return '🎉 الصندوق طلعلك جايزة!';
}

/** What the purchase gave, as lines under the receipt (luck box prize, boost end, forecast). */
function deliveryLines(result) {
    const lines = [];
    if (result.prize) lines.push(prizeLine(result.prize));
    if (result.bonusPrize) lines.push(`↪️ ${prizeLine(result.bonusPrize)}`);
    const { chat = 0, voice = 0 } = result.boostUntil || {};
    if (chat && voice && chat === voice) lines.push(`⚡ XP الشات والفويس ×2 لحد ما يخلص ${timestamp(chat)}`);
    else {
        if (chat) lines.push(`⚡ XP الشات ×2 لحد ما يخلص ${timestamp(chat)}`);
        if (voice) lines.push(`🎙️ XP الفويس ×2 لحد ما يخلص ${timestamp(voice)}`);
    }
    if (result.forecast) {
        lines.push(result.forecastDm
            ? '🔮 التنبؤ اتبعتلك في الخاص.'
            : '🔮 الخاص عندك مقفول، فالتنبؤ ظاهر ليك إنت بس هنا.');
    }
    return lines;
}

/** The receipt after a (real or trial) purchase: what was bought on top, then the numbers as cards. */
export function purchaseReceiptEmbed(user, result) {
    const bought = `${itemLabel(result.item)}${result.quantity > 1 ? ` × ${result.quantity}` : ''}`;
    const description = [`${user} ${result.trial ? 'جرب يشتري' : 'اشترى'} **${bought}**`];
    const delivered = deliveryLines(result);
    if (delivered.length) description.push('', ...delivered);
    if (result.trial) description.push('', '🧪 ده شراء تجريبي، مفيش CC اتخصم ولا حاجة اتسلمت.');
    return ccEmbed(result.trial ? '🧪 شراء تجريبي تم' : '✅ تم الشراء', description.join('\n'), {
        color: 'success',
        fields: [
            { name: `💵 ${result.trial ? 'كان هيتخصم' : 'اتخصم'}`, value: formatCC(result.cost), inline: true },
            { name: `💰 رصيدك ${result.trial ? 'لسه' : 'دلوقتي'}`, value: formatCC(result.balance), inline: true },
        ],
    });
}

/**
 * Buys and returns the reply payload (receipt or the reason it failed). A forecast is sent to the buyer
 * in DM (report #172); when their DMs are closed it comes back as `privatePayload`, to be shown only to them.
 */
export async function purchase(client, member, itemId, quantity) {
    const result = await buyItem(client, member, itemId, quantity);
    if (!result.ok) return { ok: false, payload: { content: purchaseFailureText(result), embeds: [], components: [], allowedMentions: { parse: [] } } };
    const user = member.user || member;
    let privatePayload = null;
    if (result.forecast) {
        const forecast = { embeds: [forecastEmbed(result.forecast)], allowedMentions: { parse: [] } };
        result.forecastDm = await user.send?.(forecast).then(() => true).catch(() => false) ?? false;
        if (!result.forecastDm) privatePayload = forecast;
    }
    const payload = { content: '', embeds: [purchaseReceiptEmbed(user, result)], components: [], allowedMentions: { parse: [] } };
    return { ok: true, payload, privatePayload };
}
