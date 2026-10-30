import { MessageFlags } from 'discord.js';
import { STORE_BUTTON_PREFIX, confirmPurchasePayload, purchaseFailureText } from '../../../services/cc/storeUi.js';
import { storeCatalog, findStoreItem, storeMode } from '../../../services/cc/ccStoreService.js';
import { getProfile } from '../../../services/cc/ccService.js';
import { voucherFor } from '../../../config/store/ccStoreItems.js';

// The "choose an item" menu of the store panel (`storepanel:buy`): answers privately with the
// confirmation, whose buttons are handled by src/interactions/buttons/store/storePanel.js.
async function execute(interaction, client, [action]) {
    if (!interaction.inGuild() || action !== 'buy') return;
    const item = findStoreItem(interaction.values?.[0], storeCatalog(undefined, { guildId: interaction.guildId }));
    if (!item) {
        await interaction.reply({ content: purchaseFailureText({ reason: 'not_found' }), flags: MessageFlags.Ephemeral }).catch(() => {});
        return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { cc, inventory } = await getProfile(client, interaction.guildId, interaction.user.id);
    await interaction.editReply(confirmPurchasePayload(item, 1, interaction.user.id, cc, storeMode(undefined, interaction.guildId), { vouchers: inventory?.[voucherFor(item.id)?.id] || 0 }));
    // Clear the member's choice on the panel so picking the same item again works.
    interaction.message?.edit({ components: interaction.message.components }).catch(() => {});
}

export default { name: STORE_BUTTON_PREFIX, execute };
