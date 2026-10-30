import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { GAMES_BOTS_CHANNEL_ID } from '../../config/games.js';
import { isGamesBotsChannel } from '../../services/cc/gamesBotChannel.js';
import { CC } from '../../config/cc.js';
import { bourseSettings, isSellAllWord } from '../../config/store/bourse.js';
import { getProfile } from '../../services/cc/ccService.js';
import { findAsset, getMarket, getHoldings, hourOf, assetsFor, maxOwnedOf } from '../../services/cc/bourseService.js';
import { pricesEmbed, holdingsEmbed, confirmInvestPayload, confirmSellPayload, confirmSellAllPayload, bourseFailureText } from '../../services/cc/bourseUi.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { isHomeGuild } from '../../config/homeGuild.js';

// The CC bourse: `اسعار` (prices of the hour), `شراء عربية` / `استثمار عربية` / `شراء 3 2` (buy), `بيع عربية` /
// `بيع 3 2` (sell), `بيع كلو` / `بيع عربية كلو` (sell everything / all of one asset), `شراء عربية كلو` (as many as the balance
// allows; both our server only) and `ممتلكاتي` / `ممتلكات @member` (holdings; another member's in our server only). Buying and selling are confirmed with a button
// (src/interactions/buttons/store/bourse.js). The rules are src/config/store/bourse.js.
const assetOption = (option) => option.setName('asset').setDescription('Asset number or name (see /bourse prices)').setRequired(true);
const quantityOption = (option) => option
    .setName('quantity')
    .setDescription('How many (default 1)')
    .setMinValue(1)
    .setMaxValue(bourseSettings.maxOwnedPerAsset)
    .setRequired(false);

const WRONG_CHANNEL_DELETE_MS = 5_000;

async function sendToBourseChannel(interaction, reply) {
    const content = `📈 البورصة في <#${GAMES_BOTS_CHANNEL_ID}> بس.`;
    const source = interaction._sourceMessage;
    if (!source) return reply({ content, flags: MessageFlags.Ephemeral });
    // Prefix form: the command and the notice both disappear after a few seconds.
    const notice = await source.channel.send({ content, allowedMentions: { parse: [] } }).catch(() => null);
    setTimeout(() => {
        notice?.delete().catch(() => {});
        source.delete().catch(() => {});
    }, WRONG_CHANNEL_DELETE_MS).unref?.();
}

export default {
    data: new SlashCommandBuilder()
        .setName('bourse')
        .setDescription(`The ${CC.name} (${CC.short}) bourse: prices change every hour`)
        .setDMPermission(false)
        .addSubcommand((sub) => sub.setName('prices').setDescription('Prices of the hour'))
        .addSubcommand((sub) => sub.setName('invest').setDescription('Buy an asset at the price of the hour').addStringOption(assetOption).addIntegerOption(quantityOption))
        .addSubcommand((sub) => sub.setName('sell').setDescription('Sell an asset at the price of the hour').addStringOption(assetOption).addIntegerOption(quantityOption))
        .addSubcommand((sub) => sub.setName('buymax').setDescription('Buy as many pieces of an asset as your balance allows').addStringOption(assetOption))
        .addSubcommand((sub) => sub.setName('sellall').setDescription('Sell everything you own, or all of one asset')
            .addStringOption((option) => option.setName('asset').setDescription('Only this asset (default: everything)')))
        .addSubcommand((sub) => sub.setName('holdings').setDescription('What you (or another member) own and what it is worth')
            .addUserOption((option) => option.setName('user').setDescription('Whose holdings to see (default: yours)'))),

    // `بورصة` alone shows the prices, and so do `استثمار` / `بيع` without an asset. A name of several
    // words (`بيع سبيكة دهب 2`) is kept together as the asset.
    normalizePrefixArgs(args) {
        const [sub, ...rest] = args;
        if (!args.length || ((sub === 'invest' || sub === 'sell') && !rest.length)) return ['prices'];
        // `بيع كلو` sells everything, `بيع عربية كلو` all of one asset.
        if (sub === 'sell' && isSellAllWord(rest[rest.length - 1])) return ['sellall', ...(rest.length > 1 ? [rest.slice(0, -1).join(' ')] : [])];
        // `شراء عربية كلو`: as many pieces as the balance allows.
        if (sub === 'invest' && rest.length > 1 && isSellAllWord(rest[rest.length - 1])) return ['buymax', rest.slice(0, -1).join(' ')];
        if (sub !== 'invest' && sub !== 'sell') return args;
        const quantity = rest.length > 1 && /^\d+$/u.test(rest[rest.length - 1]) ? [rest.pop()] : [];
        return [sub, rest.join(' '), ...quantity];
    },

    async execute(interaction, config, client) {
        const reply = (payload) => InteractionHelper.safeReply(interaction, { allowedMentions: { parse: [] }, ...payload });
        // The bourse works only in the games bots channel (report #121), so it doesn't flood the chat.
        if (!isGamesBotsChannel(interaction.channel, interaction.channelId)) return sendToBourseChannel(interaction, reply);
        const sub = interaction.options.getSubcommand();
        const { guildId, user } = interaction;

        if (sub === 'prices') {
            const balance = isHomeGuild(guildId) ? (await getProfile(client, guildId, user.id)).cc : null;
            return reply({ embeds: [pricesEmbed(await getMarket(client, guildId), { balance })] });
        }
        if (sub === 'holdings') {
            // `ممتلكات @member`: anyone's holdings, in our server only (report #188).
            const other = interaction.options.getUser('user');
            const whose = other && other.id !== user.id && isHomeGuild(guildId) ? other : user;
            if (whose.bot) return reply({ content: '🤖 البوتات مالهاش ممتلكات.' });
            const balance = isHomeGuild(guildId) ? (await getProfile(client, guildId, whose.id)).cc : null;
            return reply({ embeds: [holdingsEmbed(whose, await getHoldings(client, guildId, whose.id), { balance, own: whose.id === user.id })] });
        }

        if (sub === 'sellall') {
            if (!isHomeGuild(guildId)) return reply({ content: '❌ الأمر ده مش متاح هنا.' });
            const { rows, quotes } = await getHoldings(client, guildId, user.id);
            const query = interaction.options.getString('asset');
            if (query) {
                const one = findAsset(query, assetsFor(guildId));
                if (!one) return reply({ content: bourseFailureText({ reason: 'not_found' }) });
                const row = rows.find((entry) => entry.asset.id === one.id);
                if (!row) return reply({ content: bourseFailureText({ reason: 'not_owned', asset: one, owned: 0 }) });
                const { price } = quotes.find((entry) => entry.asset.id === one.id);
                return reply(confirmSellPayload(one, row.qty, price, user.id, { owned: row.qty, paid: row.paid }));
            }
            if (!rows.length) return reply({ content: '💼 معندكش حاجة تبيعها. اكتب `اسعار` وشوف تشتري إيه 📈' });
            return reply(confirmSellAllPayload(rows, user.id, hourOf()));
        }

        if (sub === 'buymax') {
            if (!isHomeGuild(guildId)) return reply({ content: '❌ الأمر ده مش متاح هنا.' });
            const one = findAsset(interaction.options.getString('asset'), assetsFor(guildId));
            if (!one) return reply({ content: bourseFailureText({ reason: 'not_found' }) });
            const { rows, quotes } = await getHoldings(client, guildId, user.id);
            const owned = rows.find((row) => row.asset.id === one.id)?.qty || 0;
            const { price } = quotes.find((entry) => entry.asset.id === one.id);
            const { cc } = await getProfile(client, guildId, user.id);
            const room = maxOwnedOf(one) - owned;
            if (room <= 0) return reply({ content: bourseFailureText({ reason: 'max_owned', asset: one, owned }) });
            const quantity = Math.min(room, Math.floor(cc / price));
            if (quantity <= 0) return reply({ content: bourseFailureText({ reason: 'no_cc', balance: cc }) });
            return reply(confirmInvestPayload(one, quantity, price, user.id, cc, { note: `🧺 أقصى عدد تقدر تشتريه دلوقتي: **${quantity}**` }));
        }

        const asset = findAsset(interaction.options.getString('asset'), assetsFor(guildId));
        if (!asset) return reply({ content: bourseFailureText({ reason: 'not_found' }) });
        const quantity = interaction.options.getInteger('quantity') || 1;
        if (quantity < 1 || quantity > bourseSettings.maxOwnedPerAsset) return reply({ content: bourseFailureText({ reason: 'bad_quantity' }) });

        const { rows, quotes } = await getHoldings(client, guildId, user.id);
        const held = rows.find((row) => row.asset.id === asset.id);
        const owned = held?.qty || 0;
        const { price } = quotes.find((entry) => entry.asset.id === asset.id);

        if (sub === 'invest') {
            if (owned + quantity > maxOwnedOf(asset)) return reply({ content: bourseFailureText({ reason: 'max_owned', asset, owned }) });
            const { cc } = await getProfile(client, guildId, user.id);
            return reply(confirmInvestPayload(asset, quantity, price, user.id, cc));
        }

        if (owned < quantity) return reply({ content: bourseFailureText({ reason: 'not_owned', asset, owned }) });
        return reply(confirmSellPayload(asset, quantity, price, user.id, { owned, paid: held.paid }));
    },
};
