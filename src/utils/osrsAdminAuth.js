import { PermissionFlagsBits } from 'discord.js';
import { getGuildConfig } from '../services/guildConfig.js';

const ADMIN_ROLES = ['Administrator', 'Support Staff', 'Admin', 'Mod', 'Moderator'];

function normalizeRoleId(role) {
    if (!role) return null;
    return typeof role === 'string' ? role : role.id || null;
}

export async function isAuthorizedOsrsAdmin(interaction, client = interaction?.client) {
    if (!interaction?.guild || !interaction?.member) {
        return false;
    }

    if (interaction.member.permissions?.has(PermissionFlagsBits.Administrator)) {
        return true;
    }

    if (interaction.guild.ownerId === interaction.user?.id) {
        return true;
    }

    const memberRoles = interaction.member.roles?.cache;
    if (!memberRoles) {
        return false;
    }

    const config = client && interaction.guildId
        ? await getGuildConfig(client, interaction.guildId).catch(() => null)
        : null;

    const configuredRoleIds = [
        normalizeRoleId(config?.adminRole),
        normalizeRoleId(config?.ticketStaffRoleId),
    ].filter(Boolean);

    if (configuredRoleIds.some((roleId) => memberRoles.has(roleId))) {
        return true;
    }

    return memberRoles.some((role) => ADMIN_ROLES.some((adminRole) =>
        role.name.toLowerCase().includes(adminRole.toLowerCase()),
    ));
}

export function getOsrsAdminPermissionError(action = 'perform this action') {
    return `You do not have permission to ${action}. Required: Owner, Administrator, or Support Staff role.`;
}
