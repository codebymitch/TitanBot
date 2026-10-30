import { ComponentType, MessageFlags } from 'discord.js';
import { isHomeGuild } from '../../../config/homeGuild.js';
import { listCustomRoles, memberRoles, checkInvite, removeMember, leaveRole, handOver, setCancelled } from '../../../services/cc/customRoleService.js';
import {
    MY_ROLE_PREFIX, MY_ROLE_PICK, myRolesPayload, invitePicker, memberPicker, invitePayload, customRoleFailureText,
    renewalChangedText, leftText, kickedText, handedText,
} from '../../../services/cc/customRoleUi.js';
import { buildStorePanel } from '../../../services/cc/storeUi.js';

// The buttons of `رولي` (customRoleUi.js): `myrole:<action>:<ownerId>[:<roleId>]`, only for the member
// who asked. Invite, remove and hand over open a private picker, answered in place (60 seconds);
// the renewal and leave buttons act right away. After each change the `رولي` message is refreshed.
const PICK_MS = 60_000;

const privately = (interaction, payload) => interaction.reply({ allowedMentions: { parse: [] }, ...payload, flags: MessageFlags.Ephemeral }).catch(() => null);

async function refresh(client, interaction, message = interaction.message) {
    const records = memberRoles(await listCustomRoles(client, interaction.guildId), interaction.user.id);
    await message?.edit(myRolesPayload(interaction.user, records)).catch(() => {});
}

/** Sends a private picker and waits for the member's choice. Returns the picker interaction, or null. */
async function pick(interaction, content, row, componentType) {
    const response = await interaction.reply({ content, components: [row], flags: MessageFlags.Ephemeral, withResponse: true }).catch(() => null);
    const message = response?.resource?.message;
    if (!message) return null;
    const choice = await message.awaitMessageComponent({ componentType, time: PICK_MS, filter: (i) => i.user.id === interaction.user.id }).catch(() => null);
    if (!choice) await interaction.editReply({ content: customRoleFailureText({ reason: 'timeout' }), components: [] }).catch(() => {});
    return choice;
}

async function memberNames(guild, ids) {
    const members = await Promise.all(ids.map((id) => guild.members.fetch(id).catch(() => null)));
    return ids.map((id, index) => ({ id, name: members[index]?.displayName || members[index]?.user?.username || id }));
}

async function execute(interaction, client, [action, ownerId, roleId]) {
    if (!interaction.inGuild() || !isHomeGuild(interaction.guildId)) return;
    if (interaction.user.id !== ownerId) return privately(interaction, { content: customRoleFailureText({ reason: 'not_yours' }) });
    const { guild, user } = interaction;

    if (action === 'shop') return privately(interaction, buildStorePanel(guild));

    const record = (await listCustomRoles(client, guild.id)).find((entry) => entry.roleId === roleId);
    if (!record) {
        await refresh(client, interaction);
        return privately(interaction, { content: customRoleFailureText({ reason: 'gone' }) });
    }

    if (action === 'cancel' || action === 'resume') {
        const result = await setCancelled(client, guild, user.id, record.kind, action === 'cancel');
        if (!result.ok) return privately(interaction, { content: customRoleFailureText(result) });
        await refresh(client, interaction);
        return privately(interaction, { content: renewalChangedText(result.record, action === 'cancel') });
    }

    if (action === 'leave') {
        const result = await leaveRole(client, guild, user.id, record.roleId);
        if (!result.ok) return privately(interaction, { content: customRoleFailureText(result) });
        await refresh(client, interaction);
        return privately(interaction, { content: leftText(result.record) });
    }

    if (action === 'invite') {
        const choice = await pick(interaction, '📨 مين صاحبك اللي عايز تدعوه؟', invitePicker(), ComponentType.UserSelect);
        if (!choice) return;
        const target = choice.users.first();
        const result = await checkInvite(client, guild, user.id, target);
        if (!result.ok) return choice.update({ content: customRoleFailureText(result), components: [] }).catch(() => {});
        // The invite is posted in the channel so the friend sees it and presses ✅.
        const sent = await interaction.channel.send(invitePayload(result.record, user.id, target.id)).catch(() => null);
        return choice.update({ content: sent ? `✅ الدعوة اتبعتت لـ ${target}.` : '❌ معرفتش أبعت الدعوة هنا.', components: [], allowedMentions: { parse: [] } }).catch(() => {});
    }

    if (action === 'kick' || action === 'leader') {
        const others = record.members.filter((id) => id !== user.id);
        if (!others.length) return privately(interaction, { content: customRoleFailureText({ reason: 'alone' }) });
        const question = action === 'kick' ? '➖ مين العضو اللي هتشيله؟' : '👑 مين العضو اللي هتسلّمه الرول؟';
        const choice = await pick(interaction, question, memberPicker(action, await memberNames(guild, others)), ComponentType.StringSelect);
        if (!choice) return;
        const targetId = choice.values[0];
        const result = action === 'kick'
            ? await removeMember(client, guild, user.id, targetId)
            : await handOver(client, guild, user.id, targetId);
        const text = result.ok ? (action === 'kick' ? kickedText(targetId, result.record) : handedText(targetId, result.record)) : customRoleFailureText(result);
        await choice.update({ content: text, components: [], allowedMentions: { parse: [] } }).catch(() => {});
        if (result.ok) await refresh(client, interaction);
    }
}

export default { name: MY_ROLE_PREFIX, execute };
