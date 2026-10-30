import { MessageFlags } from 'discord.js';
import { acceptInvite } from '../../../services/cc/customRoleService.js';
import { CUSTOM_ROLE_PREFIX, customRoleFailureText } from '../../../services/cc/customRoleUi.js';
import { isHomeGuild } from '../../../config/homeGuild.js';

// The accept / decline buttons of a custom role invite (`رولي انفايت @member`, see customRoleUi.js):
// `customrole:<accept|decline>:<roleId>:<invitedId>:<sentAt seconds>`. Only the invited member can press them.
const privately = (interaction, content) => interaction.reply({ content, allowedMentions: { parse: [] }, flags: MessageFlags.Ephemeral }).catch(() => {});

async function execute(interaction, client, [action, roleId, invitedId, sentAt]) {
    if (!interaction.inGuild() || !isHomeGuild(interaction.guildId)) return;
    if (interaction.user.id !== invitedId) return privately(interaction, '❌ الدعوة دي مش ليك.');
    if (action === 'decline') {
        return interaction.update({ content: `✖️ <@${invitedId}> رفض الدعوة.`, embeds: [], components: [], allowedMentions: { parse: [] } }).catch(() => {});
    }
    if (action !== 'accept') return;
    await interaction.deferUpdate().catch(() => {});
    const member = interaction.member?.roles?.cache ? interaction.member : await interaction.guild.members.fetch(invitedId);
    const result = await acceptInvite(client, member, roleId, Number(sentAt) * 1000);
    if (!result.ok) {
        const ended = ['expired', 'gone', 'already', 'full'].includes(result.reason);
        if (ended) return interaction.editReply({ content: customRoleFailureText(result), embeds: [], components: [], allowedMentions: { parse: [] } }).catch(() => {});
        return interaction.followUp({ content: customRoleFailureText(result), flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    return interaction.editReply({
        content: `✅ <@${invitedId}> انضم لرول <@&${roleId}> (${result.record.members.length}/${result.record.maxMembers}).`,
        embeds: [],
        components: [],
        allowedMentions: { parse: [] },
    }).catch(() => {});
}

export default { name: CUSTOM_ROLE_PREFIX, execute };
