import { MessageFlags } from 'discord.js';
import { getStoreItem, storeMode } from '../../../services/cc/ccStoreService.js';
import { buyCustomRole, parseRoleColor, validateRoleName, listCustomRoles, ledRole } from '../../../services/cc/customRoleService.js';
import { CUSTOM_ROLE_PREFIX, customRolePreviewEmbed, customRoleReceiptEmbed } from '../../../services/cc/customRoleUi.js';
import { purchaseFailureText } from '../../../services/cc/storeUi.js';
import { getProfile } from '../../../services/cc/ccService.js';
import { isHomeGuild } from '../../../config/homeGuild.js';

// The store's custom role form (`customrole:create:<itemId>`, see customRoleUi.js). In trial mode it only
// shows what the role would look like; otherwise it buys the role (customRoleService.js). The answer
// replaces the purchase confirmation it came from.
function answer(interaction, payload) {
    return interaction.editReply({ content: '', embeds: [], components: [], allowedMentions: { parse: [] }, ...payload }).catch(() => {});
}

async function execute(interaction, client, [action, itemId]) {
    if (!interaction.inGuild() || action !== 'create' || !isHomeGuild(interaction.guildId)) return;
    const item = getStoreItem(itemId);
    if (!item || item.type !== 'custom_role') {
        return interaction.reply({ content: purchaseFailureText({ reason: 'not_found' }), flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    const mode = storeMode();
    if (mode === 'closed') return interaction.reply({ content: purchaseFailureText({ reason: 'closed' }), flags: MessageFlags.Ephemeral }).catch(() => {});

    if (interaction.isFromMessage?.()) await interaction.deferUpdate();
    else await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const name = interaction.fields.getTextInputValue('name');
    const color = interaction.fields.fields?.has?.('color') ? interaction.fields.getTextInputValue('color') : '';
    let iconUrl = null;
    try {
        iconUrl = interaction.fields.getUploadedFiles('icon')?.first()?.url || null;
    } catch {
        iconUrl = null;
    }
    const member = interaction.member?.roles?.cache ? interaction.member : await interaction.guild.members.fetch(interaction.user.id);

    if (mode === 'trial') {
        if (ledRole(await listCustomRoles(client, interaction.guildId), member.id, item.kind)) return answer(interaction, { content: purchaseFailureText({ reason: 'has_role' }) });
        const checkedName = validateRoleName(name, [...interaction.guild.roles.cache.values()].map((role) => role.name));
        if (!checkedName.ok) return answer(interaction, { content: purchaseFailureText(checkedName) });
        const checkedColor = parseRoleColor(color);
        if (!checkedColor.ok) return answer(interaction, { content: purchaseFailureText({ reason: 'bad_color' }) });
        const { cc } = await getProfile(client, interaction.guildId, member.id);
        if (cc < item.price) return answer(interaction, { content: purchaseFailureText({ reason: 'no_cc', balance: cc }) });
        return answer(interaction, { embeds: [customRolePreviewEmbed(interaction.user, item, { name: checkedName.name, color: checkedColor.color, iconUrl })] });
    }

    const result = await buyCustomRole(client, member, item, { name, color, iconUrl });
    if (!result.ok) return answer(interaction, { content: purchaseFailureText(result) });
    return answer(interaction, { embeds: [customRoleReceiptEmbed(interaction.user, item, result)] });
}

export default { name: CUSTOM_ROLE_PREFIX, execute };
