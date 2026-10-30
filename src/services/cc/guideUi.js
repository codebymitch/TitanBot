// guideUi.js — `شرح`: a short, simple guide to CC, the store and the bourse, sent to the member in DM
// (src/commands/Games/guide.js). Every number comes from the config, so the guide never goes stale.
// Plain embed objects so the emojis stay.

import { inviteConditions } from '../inviteRewardService.js';
import { CC, ccEmbed, ccBoostLine, gamesBotReward } from '../../config/cc.js';
import { bourseSettings } from '../../config/store/bourse.js';
import { INVITE_REWARDS } from '../../config/inviteRewards.js';
import { GAMES_BOTS_CHANNEL_ID } from '../../config/games.js';
import { isHomeGuild } from '../../config/homeGuild.js';
import { STREAK } from './streakService.js';

const n = (value) => Number(value || 0).toLocaleString('en-US');

// `guildId`: our server's guide also explains the custom roles (`رولي`), sold there only.
export function buildGuideEmbeds({ boostLine = ccBoostLine(), guildId = null } = {}) {
    const { demand } = bourseSettings;
    const { transfer, levelUp } = CC;
    return [
        ccEmbed(`${CC.emoji} شرح ${CC.short} والمتجر والبورصة`, [
            `**${CC.short}** هي فلوس السيرفر. بتجمعها وتصرفها في المتجر أو تستثمرها في البورصة.`,
            '',
            '💰 `رصيد` ← تعرف رصيدك',
            '🏆 `توب cc` ← ترتيب السيرفر',
            ...(boostLine ? ['', boostLine] : []),
        ].join('\n')),
        ccEmbed('💡 تكسب CC ازاي؟', [
            `🎮 **الألعاب** في <#${GAMES_BOTS_CHANNEL_ID}>: الفوز في لعبة جماعية **${n(gamesBotReward('group', guildId))}**، وأول واحد يكتب الإجابة **${n(gamesBotReward('answer', guildId))}**`,
            `⭐ **اللفل**: كل لفل جديد بيديك (رقم اللفل × ${n(levelUp.perLevel)})، يعني لفل 10 = ${n(levelUp.perLevel * 10)}`,
            `📨 **الدعوات**: **${n(INVITE_REWARDS.reward)}** لكل حد تدعوه و${inviteConditions()}`,
            ...(isHomeGuild(guildId) ? [`🔥 **الستريك**: ابعت صورة أو GIF في روم الستريك كل يوم وخد **${n(STREAK.base)}** في اليوم، وبتزيد ${n(STREAK.raiseBy)} كل ${STREAK.raiseEvery} أيام لحد **${n(STREAK.cap)}**، وجوايز عند ${Object.keys(STREAK.milestones).join(' و ')} يوم (\`ستريك\` تشوف ستريكك)`] : []),
            '🔁 **التحويل**: صحابك يقدروا يحوّلولك',
        ].join('\n\n'), { color: 'success' }),
        ccEmbed('🛒 المتجر', [
            '🛍️ `متجر` ← يفتح المتجر بالمنتجات والأسعار، وتشتري من القايمة على طول',
            '🛒 `متجر 1` أو `متجر اسم المنتج` ← تشتري منتج',
            '🔢 `متجر 1 3` ← تشتري 3 قطع مرة واحدة',
            '🎒 `مخزني` ← الحاجات اللي اشتريتها',
            ...(isHomeGuild(guildId) ? [
                '',
                '🎨 `رولي` ← الرول المميزة بتاعتك، وأعضاءها وميعاد التجديد',
                '📨 `رولي انفايت @صاحبك` ← تضيف صاحبك لرول الصحاب (هو بيقبل بزرار)',
                '🚪 `رولي اخرج` ← تخرج من رول صحاب',
                '🛑 `رولي الغي` / `رولي كمل` ← توقف أو ترجع التجديد الشهري',
            ] : []),
            '',
            'قبل أي شراء بيجيلك زرار ✅ تأكد بيه.',
        ].join('\n')),
        ccEmbed('📈 البورصة (الاستثمار)', [
            `حاجات زي العربية والشقة والطيارة، بتشتريها وتبيعها في <#${GAMES_BOTS_CHANNEL_ID}>.`,
            `**السعر بيتغير كل ساعة**، ممكن يزيد أو يقل لحد **${bourseSettings.maxMovePercent}%**.`,
            '',
            '📊 `اسعار` ← أسعار الساعة دي',
            '💵 `شراء عربية` أو `استثمار عربية` ← تشتري (ولو عايز 2: `شراء عربية 2`)',
            '💸 `بيع عربية` ← تبيع بسعر الساعة',
            ...(isHomeGuild(guildId) ? [
                '🛒 `شراء عربية كلو` ← تشتري أكبر عدد يقدر عليه رصيدك',
                '🧺 `بيع عربية كلو` ← تبيع كل العربيات، و`بيع كلو` ← تبيع كل حاجة معاك',
            ] : []),
            '💼 `ممتلكاتي` ← اللي معاك ومكسبك أو خسارتك',
            '',
            '🧠 **الفكرة:** اشتري والسعر واطي، وبيع لما يعلى.',
            `🔥 لو الناس اشتروا **${demand.guaranteedRiseUnits} قطعة أو أكتر** من حاجة في نفس الساعة، سعرها **لازم يزيد** الساعة الجاية.`,
            `🧾 البيع عليه رسوم **${bourseSettings.sellFeePercent}%**، وأقصى حاجة **${bourseSettings.maxOwnedPerAsset} قطعة** من كل حاجة.`,
            ...(isHomeGuild(guildId) ? ['🏰 **القصر**: بيبدأ بحوالي 50,000، سعره عشوائي تماماً ومالوش سقف (ممكن يوصل 500,000 وأكتر)، وأقصاك **5** بس.'] : []),
        ].join('\n'), { color: 'info' }),
        ccEmbed('🔁 التحويل', [
            '`تحويل @صاحبك 100` ← تبعتله 100',
            `أول ${transfer.cheapPerWeek} تحويلات في الأسبوع عليهم ضريبة **${transfer.taxPercent}%**، وبعدها الضريبة بتزيد (لحد ${transfer.maxTaxPercent}%).`,
            `أقل تحويل ${n(transfer.minAmount)} ${CC.short}.`,
        ].join('\n')),
    ];
}
