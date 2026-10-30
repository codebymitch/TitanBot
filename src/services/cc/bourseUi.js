// bourseUi.js — the bourse's embeds and buttons, shared by the `bourse` command
// (src/commands/Games/bourse.js) and its confirm buttons (src/interactions/buttons/store/bourse.js).
// Plain embed objects so the emojis stay. Each line starts with Arabic so Discord doesn't reorder it.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { CC, ccEmbed, formatCC } from '../../config/cc.js';
import { bourseSettings } from '../../config/store/bourse.js';
import { sellFee, maxOwnedOf } from './bourseService.js';

export const BOURSE_BUTTON_PREFIX = 'bourse';

const number = (value) => Number(value || 0).toLocaleString('en-US');

function assetLabel(asset) {
    return `${asset.emoji} ${asset.name}`;
}

/** `🟢 ▲ 6.1%`, `🔴 ▼ 1.2%`, or '' when the price didn't move. */
export function changeArrow(changePercent) {
    if (changePercent > 0) return `🟢 ▲ ${changePercent}%`;
    if (changePercent < 0) return `🔴 ▼ ${Math.abs(changePercent)}%`;
    return '';
}

function signedCC(amount) {
    if (amount > 0) return `🟢 مكسب ${formatCC(amount)}`;
    if (amount < 0) return `🔴 خسارة ${formatCC(-amount)}`;
    return '⚪ لا مكسب ولا خسارة';
}

/**
 * `اسعار`: a grid of cards (3 per row on a computer), one per asset with its price and its move since
 * last hour, then a card with how to buy and sell. The rules are in the small footer.
 */
/** ` (والقصر 5 بس)` when an asset in the list has its own lower limit. */
function limited(quotes) {
    const special = quotes.filter(({ asset }) => asset.maxOwned).map(({ asset }) => `${asset.name} ${asset.maxOwned} بس`);
    return special.length ? ` (وال${special.join('، ال')})` : '';
}

export function pricesEmbed({ quotes, nextChangeAt }, { balance = null } = {}) {
    const next = Math.floor(nextChangeAt / 1000);
    // With the member's balance (our server), the 🔥 demand mark and its legend are gone and the footer
    // shows the balance instead (the owner's request); other servers keep the old card.
    const showDemand = balance === null;
    const cards = quotes.map(({ asset, price, changePercent, raised }) => ({
        name: `${asset.emoji} ${asset.name}`,
        value: [`**${number(price)}** ${CC.emoji}`, [changeArrow(changePercent), showDemand && raised ? '🔥' : ''].filter(Boolean).join(' ')].filter(Boolean).join('\n'),
        inline: true,
    }));
    const embed = ccEmbed('📈 البورصة', `⏰ الأسعار الجاية <t:${next}:R>`, {
        fields: [
            ...cards,
            { name: '🛒 ازاي تشتري', value: '`شراء عربية`\n`بيع عربية`\n`ممتلكاتي`', inline: true },
        ],
    });
    embed.footer = {
        text: `رسوم البيع ${bourseSettings.sellFeePercent}% ・ أقصى ${bourseSettings.maxOwnedPerAsset} قطعة من كل حاجة${limited(quotes)} ・ ${showDemand ? '🔥 = عليها طلب' : `💰 رصيدك: ${number(balance)} ${CC.short}`}`,
    };
    return embed;
}

/** `ممتلكاتي`: what the member owns, what they paid and what they'd get selling now. */
export function holdingsEmbed(user, { rows, totalValue, totalPaid, totalIfSold }, { balance = null, own = true } = {}) {
    // Another member's holdings (`ممتلكات @member`, report #188) are worded about them.
    const words = own
        ? { title: '💼 ممتلكاتي', balance: '💰 رصيدك', empty: 'معندكش حاجة لسه. اكتب `اسعار` وشوف تشتري إيه 📈', paid: 'دفعت', sold: 'لو بعت', soldAll: 'لو بعت كله' }
        : { title: `💼 ممتلكات ${user.displayName || user.username || ''}`.trim(), balance: '💰 رصيده', empty: 'معندوش حاجة في البورصة لسه.', paid: 'دفع', sold: 'لو باع', soldAll: 'لو باع كله' };
    // The member's CC balance (report #174), when given.
    const balanceField = balance === null ? [] : [{ name: words.balance, value: formatCC(balance), inline: true }];
    if (!rows.length) {
        return ccEmbed(words.title, `${user}\n\n${words.empty}`, { fields: balanceField });
    }
    const lines = rows.map((row) => [
        `${row.asset.emoji} **${row.asset.name}** × ${row.qty}`,
        `> ${words.paid}: ${formatCC(row.paid)} ・ قيمتها دلوقتي: ${formatCC(row.value)}`,
        `> ${words.sold}: ${formatCC(row.ifSold)} ・ ${signedCC(row.profit)}`,
    ].join('\n'));
    return ccEmbed(words.title, [`${user}`, '', lines.join('\n\n')].join('\n'), {
        fields: [
            { name: `💵 ${words.paid}`, value: formatCC(totalPaid), inline: true },
            { name: '📊 قيمتها', value: formatCC(totalValue), inline: true },
            { name: `🧾 ${words.soldAll}`, value: `${formatCC(totalIfSold)}\n${signedCC(totalIfSold - totalPaid)}`, inline: true },
            ...balanceField,
        ],
        thumbnail: user.displayAvatarURL?.() || null,
    });
}

function confirmRow(action, asset, quantity, price, userId, { label, disabled = false }) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${BOURSE_BUTTON_PREFIX}:${action}:${asset.id}:${quantity}:${price}:${userId}`)
            .setLabel(label)
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
        new ButtonBuilder().setCustomId(`${BOURSE_BUTTON_PREFIX}:cancel:${userId}`).setLabel('إلغاء').setEmoji('✖️').setStyle(ButtonStyle.Secondary),
    );
}

/** The "are you sure?" step before buying, at `price`. The buttons only work for `userId`. */
export function confirmInvestPayload(asset, quantity, price, userId, balance, { note = '' } = {}) {
    const cost = price * quantity;
    const after = balance - cost;
    const embed = ccEmbed('💰 تأكيد الاستثمار', [
        ...(note ? [note, ''] : []),
        `${assetLabel(asset)} × ${quantity}`,
        '',
        `🏷️ سعر القطعة: ${formatCC(price)}`,
        `💵 الإجمالي: ${formatCC(cost)}`,
        `💰 رصيدك: ${formatCC(balance)}`,
        after >= 0 ? `📉 بعد الشراء: ${formatCC(after)}` : `❌ ناقصك ${formatCC(-after)}`,
        '',
        '⏰ السعر ده لحد آخر الساعة بس.',
    ].join('\n'));
    return {
        content: '',
        embeds: [embed],
        components: [confirmRow('buy', asset, quantity, price, userId, { label: 'اشتري', disabled: after < 0 })],
        allowedMentions: { parse: [] },
    };
}

/** The "are you sure?" step before selling `quantity` of the `owned` pieces (that cost `paid`) at `price`. */
export function confirmSellPayload(asset, quantity, price, userId, { owned, paid }, { note = '' } = {}) {
    const gross = price * quantity;
    const fee = sellFee(gross);
    const received = gross - fee;
    const soldCost = owned === quantity ? paid : Math.round((paid * quantity) / owned);
    const embed = ccEmbed('💸 تأكيد البيع', [
        ...(note ? [note, ''] : []),
        `${assetLabel(asset)} × ${quantity} (معاك ${owned})`,
        '',
        `🏷️ سعر القطعة: ${formatCC(price)}`,
        `💵 الإجمالي: ${formatCC(gross)}`,
        `🧾 رسوم البيع (${bourseSettings.sellFeePercent}%): ${formatCC(fee)}`,
        `✅ هتاخد: ${formatCC(received)}`,
        `📊 ${signedCC(received - soldCost)}`,
    ].join('\n'));
    return {
        content: '',
        embeds: [embed],
        components: [confirmRow('sell', asset, quantity, price, userId, { label: 'بيع' })],
        allowedMentions: { parse: [] },
    };
}

/** `بيع كلو`: everything the member owns, at the prices of `hour`. The button only works for `userId`. */
export function confirmSellAllPayload(rows, userId, hour, { note = '' } = {}) {
    const gross = rows.reduce((sum, row) => sum + row.value, 0);
    const received = rows.reduce((sum, row) => sum + row.ifSold, 0);
    const paid = rows.reduce((sum, row) => sum + row.paid, 0);
    const embed = ccEmbed('💸 تأكيد بيع الكل', [
        ...(note ? [note, ''] : []),
        ...rows.map((row) => `${assetLabel(row.asset)} × ${row.qty} ・ ${formatCC(row.ifSold)}`),
        '',
        `💵 الإجمالي: ${formatCC(gross)}`,
        `🧾 رسوم البيع (${bourseSettings.sellFeePercent}%): ${formatCC(gross - received)}`,
        `✅ هتاخد: ${formatCC(received)}`,
        `📊 ${signedCC(received - paid)}`,
    ].join('\n'));
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${BOURSE_BUTTON_PREFIX}:sellall:${hour}:${userId}`).setLabel('بيع الكل').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`${BOURSE_BUTTON_PREFIX}:cancel:${userId}`).setLabel('إلغاء').setEmoji('✖️').setStyle(ButtonStyle.Secondary),
    );
    return { content: '', embeds: [embed], components: [row], allowedMentions: { parse: [] } };
}

/** After `بيع كلو`: every asset sold, the total and the balance. */
export function sellAllReceiptEmbed(user, results, { before, balance }) {
    const received = results.reduce((sum, result) => sum + result.received, 0);
    const paid = results.reduce((sum, result) => sum + result.paid, 0);
    return ccEmbed('✅ اتباع كله', [
        `${user} باع كل ممتلكاته:`,
        ...results.map((result) => `${assetLabel(result.asset)} × ${result.quantity} ・ ${formatCC(result.received)}`),
        '',
        `✅ خدت: ${formatCC(received)}`,
        `📊 ${signedCC(received - paid)}`,
    ].join('\n'), { color: 'success', fields: [balanceField(before, balance)] });
}

const balanceField = (before, after) => ({ name: '💰 رصيدك', value: `قبل: ${formatCC(before)}\nدلوقتي: ${formatCC(after)}`, inline: true });

/** After buying: what was bought on top, then the numbers as cards (3 per row on a computer). */
export function investReceiptEmbed(user, result) {
    return ccEmbed('✅ تم الاستثمار', `${user} اشترى **${assetLabel(result.asset)} × ${result.quantity}**`, {
        color: 'success',
        fields: [
            { name: '🏷️ سعر القطعة', value: formatCC(result.price), inline: true },
            { name: '💵 اتخصم', value: formatCC(result.cost), inline: true },
            { name: '💼 معاك دلوقتي', value: `${result.owned}`, inline: true },
            balanceField(result.before, result.balance),
        ],
    });
}

/** After selling: what was sold on top, then the numbers as cards. */
export function sellReceiptEmbed(user, result) {
    return ccEmbed('✅ تم البيع', `${user} باع **${assetLabel(result.asset)} × ${result.quantity}**\n${signedCC(result.profit)}`, {
        color: 'success',
        fields: [
            { name: '🏷️ سعر القطعة', value: formatCC(result.price), inline: true },
            { name: '🧾 الرسوم', value: formatCC(result.fee), inline: true },
            { name: '✅ وصلك', value: formatCC(result.received), inline: true },
            { name: '💼 فاضل معاك', value: `${result.owned}`, inline: true },
            balanceField(result.before, result.balance),
        ],
    });
}

const FAILURE_TEXT = {
    not_found: '❌ المنتج ده مش في البورصة. اكتب `اسعار` وشوف الأرقام.',
    bad_quantity: `❌ العدد لازم يكون من 1 لـ ${bourseSettings.maxOwnedPerAsset}.`,
};

/** The reason a purchase or a sale failed, as a message. */
export function bourseFailureText(result) {
    if (result.reason === 'no_cc') return `❌ رصيدك ${formatCC(result.balance ?? 0)} مش كفاية.`;
    if (result.reason === 'max_owned') {
        return `❌ أقصى حاجة ${maxOwnedOf(result.asset)} قطعة من ${result.asset ? assetLabel(result.asset) : 'المنتج ده'}، ومعاك ${result.owned}.`;
    }
    if (result.reason === 'not_owned') {
        return result.owned
            ? `❌ معاك ${result.owned} بس من ${assetLabel(result.asset)}.`
            : `❌ معندكش ${result.asset ? assetLabel(result.asset) : 'المنتج ده'}. اكتب \`ممتلكاتي\` وشوف اللي معاك.`;
    }
    return FAILURE_TEXT[result.reason] || '❌ حصلت مشكلة، جرب تاني.';
}

export const PRICE_CHANGED_NOTE = '⚠️ **السعر اتغير!** ده السعر الجديد، أكد تاني لو لسه عايز.';

/** `⬆️ هيطلع 4.2%`, `⬇️ هينزل 3%` or `➖ ثابت` (the forecast price is exact, see forecastMarket). */
export function forecastLine(changePercent) {
    const amount = Math.round(Math.abs(changePercent) * 10) / 10;
    if (changePercent > 0) return `⬆️ هيطلع **${amount}%**`;
    if (changePercent < 0) return `⬇️ هينزل **${amount}%**`;
    return '➖ ثابت';
}

/** The store's bourse forecast (sent to the buyer in DM): a card per asset with its price now and its exact next price. */
export function forecastEmbed({ forecasts, nextChangeAt }) {
    const next = Math.floor(nextChangeAt / 1000);
    const embed = ccEmbed('🔮 تنبؤ البورصة', `الأسعار الجاية <t:${next}:R>، ودي هتبقى بالظبط:`, {
        fields: forecasts.map(({ asset, current, next: nextPrice, changePercent }) => ({
            name: assetLabel(asset),
            value: `${forecastLine(changePercent)}\n${number(current)} ← **${number(nextPrice ?? current)}** ${CC.emoji}`,
            inline: true,
        })),
    });
    embed.footer = { text: 'الأسعار دي اتثبتت للساعة الجاية، الشراء والبيع مش هيغيّروها ・ التنبؤ ليك إنت بس' };
    return embed;
}
