import { SlashCommandBuilder } from 'discord.js';
import { CC } from '../../config/cc.js';
import { ccStoreSettings, voucherFor } from '../../config/store/ccStoreItems.js';
import { getProfile } from '../../services/cc/ccService.js';
import { storeCatalog, findStoreItem, storeMode, maxQuantityOf } from '../../services/cc/ccStoreService.js';
import { buildStorePanel, inventoryEmbed, confirmPurchasePayload, purchaseFailureText } from '../../services/cc/storeUi.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { isHomeGuild } from '../../config/homeGuild.js';

// The CC store: `متجر` alone sends the store panel (items, buy menu and buttons), `متجر 1` /
// `متجر رتبة vip` / `متجر 1 3` buys (confirmed with a button), `مخزني` shows the inventory.
// (`شراء` is the bourse's buy.) The store room and its pinned panel are src/services/cc/storeChannel.js.
export default {
    data: new SlashCommandBuilder()
        .setName('store')
        .setDescription(`The ${CC.name} (${CC.short}) store`)
        .setDMPermission(false)
        .addSubcommand((sub) => sub.setName('list').setDescription('Show what the store sells'))
        .addSubcommand((sub) => sub
            .setName('buy')
            .setDescription('Buy an item from the store')
            .addStringOption((option) => option.setName('item').setDescription('Item number or name').setRequired(true))
            .addIntegerOption((option) => option
                .setName('quantity')
                .setDescription('How many (default 1)')
                .setMinValue(1)
                .setMaxValue(ccStoreSettings.maxQuantity)
                .setRequired(false)))
        .addSubcommand((sub) => sub.setName('inventory').setDescription('What you bought')),

    // `store` / `shop` alone shows the panel; `متجر <item> [quantity]` buys, the item being a number
    // or a name of several words.
    normalizePrefixArgs(args) {
        if (!args.length) return ['list'];
        const [sub, ...rest] = args;
        if (sub !== 'list' || !rest.length) return args;
        const quantity = rest.length > 1 && /^\d+$/u.test(rest[rest.length - 1]) ? [rest.pop()] : [];
        return ['buy', rest.join(' '), ...quantity];
    },

    async execute(interaction, config, client) {
        const reply = (payload) => InteractionHelper.safeReply(interaction, { allowedMentions: { parse: [] }, ...payload });
        const sub = interaction.options.getSubcommand();

        if (sub === 'list') {
            // Our server shows the member's balance on the panel (report #174); other servers keep the old panel.
            const balance = isHomeGuild(interaction.guildId) ? (await getProfile(client, interaction.guildId, interaction.user.id)).cc : null;
            return reply(buildStorePanel(interaction.guild, { balance }));
        }

        if (sub === 'inventory') {
            const { inventory } = await getProfile(client, interaction.guildId, interaction.user.id);
            return reply({ embeds: [inventoryEmbed(interaction.user, inventory)] });
        }

        const mode = storeMode(undefined, interaction.guildId);
        if (mode === 'closed') return reply({ content: purchaseFailureText({ reason: 'closed' }) });
        const item = findStoreItem(interaction.options.getString('item'), storeCatalog(undefined, { guildId: interaction.guildId }));
        if (!item) return reply({ content: purchaseFailureText({ reason: 'not_found' }) });
        const quantity = interaction.options.getInteger('quantity') || 1;
        if (quantity < 1 || quantity > maxQuantityOf(item)) {
            return reply({ content: purchaseFailureText({ reason: 'bad_quantity' }) });
        }
        const { cc, inventory } = await getProfile(client, interaction.guildId, interaction.user.id);
        return reply(confirmPurchasePayload(item, quantity, interaction.user.id, cc, mode, { vouchers: inventory?.[voucherFor(item.id)?.id] || 0 }));
    },
};
