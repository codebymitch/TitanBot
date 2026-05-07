import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

const ownerIds = () => process.env.OWNER_IDS?.split(',').map(id => id.trim()) ?? [];

export default {
    data: new SlashCommandBuilder()
        .setName('managerole')
        .setDescription('Add or remove a role from a member (bot owner only)')
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add a role to a member')
                .addUserOption(opt => opt.setName('member').setDescription('The member to give the role to').setRequired(true))
                .addRoleOption(opt => opt.setName('role').setDescription('The role to add').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove a role from a member')
                .addUserOption(opt => opt.setName('member').setDescription('The member to remove the role from').setRequired(true))
                .addRoleOption(opt => opt.setName('role').setDescription('The role to remove').setRequired(true))
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    category: 'moderation',

    async execute(interaction, config, client) {
        try {
            if (!ownerIds().includes(interaction.user.id)) {
                return await InteractionHelper.universalReply(interaction, {
                    embeds: [errorEmbed('Access Denied', 'Only the bot owner can use this command.')],
                    ephemeral: true,
                });
            }

            const sub = interaction.options.getSubcommand();
            const user = interaction.options.getUser('member');
            const role = interaction.options.getRole('role');
            const member = await interaction.guild.members.fetch(user.id).catch(() => null);

            if (!member) {
                return await InteractionHelper.universalReply(interaction, {
                    embeds: [errorEmbed('Member Not Found', `${user.tag} is not in this server.`)],
                    ephemeral: true,
                });
            }

            if (role.managed) {
                return await InteractionHelper.universalReply(interaction, {
                    embeds: [errorEmbed('Cannot Modify Role', `<@&${role.id}> is a managed role and cannot be assigned manually.`)],
                    ephemeral: true,
                });
            }

            if (role.position >= interaction.guild.members.me.roles.highest.position) {
                return await InteractionHelper.universalReply(interaction, {
                    embeds: [errorEmbed('Role Too High', `<@&${role.id}> is at or above the bot's highest role and cannot be managed.`)],
                    ephemeral: true,
                });
            }

            if (sub === 'add') {
                if (member.roles.cache.has(role.id)) {
                    return await InteractionHelper.universalReply(interaction, {
                        embeds: [errorEmbed('Already Has Role', `${user.tag} already has <@&${role.id}>.`)],
                        ephemeral: true,
                    });
                }
                await member.roles.add(role, `managerole by ${interaction.user.tag}`);
                await InteractionHelper.universalReply(interaction, {
                    embeds: [successEmbed(`Role Added`, `Added <@&${role.id}> to ${user.tag}.`)],
                    ephemeral: true,
                });
            } else {
                if (!member.roles.cache.has(role.id)) {
                    return await InteractionHelper.universalReply(interaction, {
                        embeds: [errorEmbed('Role Not Found', `${user.tag} does not have <@&${role.id}>.`)],
                        ephemeral: true,
                    });
                }
                await member.roles.remove(role, `managerole by ${interaction.user.tag}`);
                await InteractionHelper.universalReply(interaction, {
                    embeds: [successEmbed(`Role Removed`, `Removed <@&${role.id}> from ${user.tag}.`)],
                    ephemeral: true,
                });
            }
        } catch (error) {
            await handleInteractionError(interaction, error, { subtype: 'managerole_failed' });
        }
    },
};
