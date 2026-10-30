import { MessageFlags } from 'discord.js';
import { REJOIN_BUTTON_PREFIX, decideRejoinRoles, logRejoinDecision } from '../../../services/moderation/rejoinRestore.js';

// ✅ / ❌ on "a member came back with staff roles" (`rejoinroles:approve|deny:<userId>`,
// services/moderation/rejoinRestore.js). Only an owner or a trusted member can decide. Once decided the
// request is deleted and the decision is posted in the log channel (REJOIN_LOG_CHANNEL_ID).
const FAILURE_TEXT = {
    not_trusted: '❌ الموافقة لصاحب السيرفر أو اللي معمولهم تراست بس.',
    nothing: 'ℹ️ الطلب ده اتقرر قبل كده.',
    left: '🚪 العضو طلع تاني، الرولات هتستناه لما يرجع.',
};

async function execute(interaction, client, [action, userId]) {
    if (!interaction.inGuild() || (action !== 'approve' && action !== 'deny')) return;
    const result = await decideRejoinRoles(interaction.guild, interaction.user.id, userId, action === 'approve');
    if (!result.ok) {
        return interaction.reply({ content: FAILURE_TEXT[result.reason], flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    await interaction.deferUpdate().catch(() => {});
    await logRejoinDecision(interaction.guild, userId, interaction.user.id, result.approved ? result.given : result.asked, result.approved, result.skipped);
    await interaction.message?.delete().catch(() => {});
}

export default { name: REJOIN_BUTTON_PREFIX, execute };
