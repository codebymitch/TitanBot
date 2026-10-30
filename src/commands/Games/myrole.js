import { SlashCommandBuilder } from 'discord.js';
import { listCustomRoles, memberRoles, checkInvite, removeMember, leaveRole, handOver, setCancelled } from '../../services/cc/customRoleService.js';
import { myRolesPayload, invitePayload, customRoleFailureText, renewalChangedText, leftText, kickedText, handedText } from '../../services/cc/customRoleUi.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { myRoleWords } from '../../config/commands/commandAliases.js';
import { isHomeGuild } from '../../config/homeGuild.js';

// `رولي`: the custom roles bought in the CC store (customRoleService.js).
//   رولي                  your roles, their members and renewal, with a button for each thing you can do
//                         (src/interactions/buttons/store/myRole.js); the words below still work too
//   رولي انفايت @member   invite a friend to your friends role (they accept with a button)
//   رولي شيل @member      remove a member      ・ رولي ليدر @member  hand the role over
//   رولي اخرج [@role]     leave a friends role ・ رولي الغي / رولي كمل [شخصي|صحاب]  stop / restart the renewal
const KIND_WORDS = { شخصي: 'personal', شخصية: 'personal', بتاعي: 'personal', personal: 'personal', صحاب: 'friends', صحابي: 'friends', اصحاب: 'friends', أصحاب: 'friends', friends: 'friends' };
const kindOption = (option) => option.setName('kind').setDescription('Which role (when you lead both)').setRequired(false)
    .addChoices({ name: 'personal', value: 'personal' }, { name: 'friends', value: 'friends' });

export default {
    data: new SlashCommandBuilder()
        .setName('myrole')
        .setDescription('Your custom roles from the CC store')
        .setDMPermission(false)
        .addSubcommand((sub) => sub.setName('info').setDescription('Your custom roles'))
        .addSubcommand((sub) => sub.setName('invite').setDescription('Invite a member to your friends role')
            .addUserOption((option) => option.setName('user').setDescription('Member').setRequired(true)))
        .addSubcommand((sub) => sub.setName('kick').setDescription('Remove a member from your friends role')
            .addUserOption((option) => option.setName('user').setDescription('Member').setRequired(true)))
        .addSubcommand((sub) => sub.setName('leader').setDescription('Hand your friends role to one of its members')
            .addUserOption((option) => option.setName('user').setDescription('Member').setRequired(true)))
        .addSubcommand((sub) => sub.setName('leave').setDescription('Leave a friends role')
            .addRoleOption((option) => option.setName('role').setDescription('The role (when you are in several)').setRequired(false)))
        .addSubcommand((sub) => sub.setName('cancel').setDescription('Stop the renewal (the role stays to the end of the paid month)').addStringOption(kindOption))
        .addSubcommand((sub) => sub.setName('resume').setDescription('Restart the renewal').addStringOption(kindOption)),

    // `رولي` alone shows your roles; `رولي انفايت @x`, `رولي الغي صحاب`...
    normalizePrefixArgs(args) {
        if (!args.length) return ['info'];
        const [word, ...rest] = args;
        const sub = myRoleWords[word.toLowerCase()];
        if (!sub) return ['info'];
        if (sub === 'cancel' || sub === 'resume') {
            const kind = KIND_WORDS[(rest[0] || '').toLowerCase()];
            return kind ? [sub, kind] : [sub];
        }
        return [sub, ...rest.slice(0, 1)];
    },

    async execute(interaction, config, client) {
        const reply = (payload) => InteractionHelper.safeReply(interaction, { allowedMentions: { parse: [] }, ...payload });
        const fail = (result) => reply({ content: customRoleFailureText(result) });
        const { guild, user } = interaction;
        // Custom roles are sold in our server only (src/config/homeGuild.js).
        if (!isHomeGuild(guild.id)) return reply({ content: '❌ الأمر ده مش متاح في السيرفر ده.' });
        const sub = interaction.options.getSubcommand() || 'info';

        if (sub === 'info') {
            return reply(myRolesPayload(user, memberRoles(await listCustomRoles(client, guild.id), user.id)));
        }

        if (sub === 'cancel' || sub === 'resume') {
            const cancelled = sub === 'cancel';
            const result = await setCancelled(client, guild, user.id, interaction.options.getString('kind'), cancelled);
            if (!result.ok) return fail(result.reason === 'no_role' ? { reason: 'no_role_any' } : result);
            return reply({ content: renewalChangedText(result.record, cancelled) });
        }

        if (sub === 'leave') {
            const result = await leaveRole(client, guild, user.id, interaction.options.getRole('role')?.id || null);
            if (!result.ok) return fail(result);
            return reply({ content: leftText(result.record) });
        }

        const target = interaction.options.getUser('user');
        const targetMember = target && await guild.members.fetch(target.id).catch(() => null);
        if (!targetMember) return fail({ reason: 'no_member' });

        if (sub === 'invite') {
            const result = await checkInvite(client, guild, user.id, targetMember.user);
            if (!result.ok) return fail(result);
            return reply(invitePayload(result.record, user.id, targetMember.id));
        }
        if (sub === 'kick') {
            const result = await removeMember(client, guild, user.id, targetMember.id);
            if (!result.ok) return fail(result);
            return reply({ content: kickedText(targetMember.id, result.record) });
        }
        if (sub === 'leader') {
            const result = await handOver(client, guild, user.id, targetMember.id);
            if (!result.ok) return fail(result);
            return reply({ content: handedText(targetMember.id, result.record) });
        }
        return reply(myRolesPayload(user, []));
    },
};
