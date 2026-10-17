import { getColor } from '../../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction, Role } from 'discord.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';
import { ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import type { Command } from '../../../types/index.js';

function createAutoroleInfoEmbed(description: string) {
    return new EmbedBuilder()
        .setColor(getColor('primary'))
        .setDescription(description)
        .setFooter({ text: new Date().toLocaleString() });
}

export default {
    data: new SlashCommandBuilder()
        .setName('autorole')
        .setDescription('Rollen verwalten, die neuen Mitgliedern automatisch vergeben werden')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Eine Rolle hinzufügen, die neue Mitglieder automatisch erhalten')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('Die Rolle, die hinzugefügt wird')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Eine Rolle aus der automatischen Vergabe entfernen')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('Die Rolle, die entfernt wird')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Alle automatisch vergebenen Rollen anzeigen')),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Autorole interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'autorole'
            });
            return;
        }

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Du brauchst die Berechtigung **Server verwalten**, um `/welcome autorole` zu nutzen.' });
        }

    const { options, guild, client } = interaction as ChatInputCommandInteraction<'cached'>;
        const subcommand = options.getSubcommand();

        if (subcommand === 'add') {
            const role = options.getRole('role')!;

            const guildConfig = await getGuildConfig(client, guild.id);
            const verificationEnabled = Boolean(guildConfig.verification?.enabled);
            const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);

            if (verificationEnabled || autoVerifyEnabled) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Du kannst keine Auto-Rolle hinzufügen, solange die Verifizierung oder AutoVerify aktiviert ist. Deaktiviere diese zuerst.' });
            }
            
            if (role.position >= guild.members.me!.roles.highest.position) {
                logger.warn(`[Autorole] User ${interaction.user.tag} tried to add role ${role.name} (${role.id}) higher than bot's highest role in ${guild.name}`);
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Ich kann keine Rollen vergeben, die höher sind als meine höchste Rolle.' });
            }

            try {
                const config = await getWelcomeConfig(client, guild.id);
                const existingRoles = config.roleIds || [];
                const currentRoleId = existingRoles[0] || null;

                if (currentRoleId === role.id) {
                    logger.info(`[Autorole] User ${interaction.user.tag} tried to add duplicate role ${role.name} (${role.id}) in ${guild.name}`);
                    return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Die Rolle ${role} wird bereits automatisch vergeben.` });
                }

                await updateWelcomeConfig(client, guild.id, {
                    roleIds: [role.id]
                });

                logger.info(`[Autorole] Set single auto-role to ${role.name} (${role.id}) in ${guild.name} by ${interaction.user.tag}`);
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [createAutoroleInfoEmbed(
                        currentRoleId
                            ? `✅ Auto-Rolle auf ${role} geändert. Es ist nur eine Auto-Rolle erlaubt.`
                            : `✅ Auto-Rolle auf ${role} gesetzt.`
                    )],
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                logger.error(`[Autorole] Failed to add role for guild ${guild.id}:`, error);
                await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Hinzufügen der Rolle ist ein Fehler aufgetreten. Bitte versuch es erneut.' });
            }
        } 
        
        else if (subcommand === 'remove') {
            const role = options.getRole('role')!;

            try {
                const config = await getWelcomeConfig(client, guild.id);
                const existingRoles = config.roleIds || [];
                
                if (!existingRoles.includes(role.id)) {
                    logger.info(`[Autorole] User ${interaction.user.tag} tried to remove non-existent role ${role.name} (${role.id}) in ${guild.name}`);
                    return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `Die Rolle ${role} wird nicht automatisch vergeben.` });
                }

                const updatedRoles = existingRoles.filter(id => id !== role.id);
                
                await updateWelcomeConfig(client, guild.id, {
                    roleIds: updatedRoles
                });

                logger.info(`[Autorole] Removed role ${role.name} (${role.id}) from auto-assign in ${guild.name} by ${interaction.user.tag}`);
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [createAutoroleInfoEmbed(`✅ ${role} wurde aus den automatisch vergebenen Rollen entfernt.`)],
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                logger.error(`[Autorole] Failed to remove role for guild ${guild.id}:`, error);
                await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Entfernen der Rolle ist ein Fehler aufgetreten. Bitte versuch es erneut.' });
            }
        }
        
        else if (subcommand === 'list') {
            try {
                const guildConfig = await getGuildConfig(client, guild.id);
                const verificationEnabled = Boolean(guildConfig.verification?.enabled);
                const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);
                const conflictSummary = [
                    verificationEnabled ? 'Die Verifizierung ist aktiviert' : null,
                    autoVerifyEnabled ? 'AutoVerify ist aktiviert' : null
                ].filter(Boolean).join('\n');

                const config = await getWelcomeConfig(client, guild.id);
                const autoRoles = Array.isArray(config.roleIds) ? config.roleIds : [];

                const singleRoleIds = autoRoles.length > 1 ? [autoRoles[0]] : autoRoles;
                if (singleRoleIds.length !== autoRoles.length) {
                    await updateWelcomeConfig(client, guild.id, {
                        roleIds: singleRoleIds
                    });
                    logger.info(`[Autorole] Trimmed auto-role list to one role in ${interaction.guild!.name}`);
                }

                if (singleRoleIds.length === 0) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [createAutoroleInfoEmbed(`ℹ️ Es wird keine Rolle automatisch vergeben.${conflictSummary ?`\n\n⚠️ Hindernisse für die Einrichtung:\n${conflictSummary}`: ''}`)],
                        flags: MessageFlags.Ephemeral
                    });
                }

                const roles = await guild.roles.fetch();
                const validRoles: Role[] = [];
                const invalidRoleIds: string[] = [];
                
                for (const roleId of singleRoleIds) {
                    const role = roles.get(roleId);
                    if (role) {
                        validRoles.push(role);
                    } else {
                        invalidRoleIds.push(roleId);
                    }
                }

                if (invalidRoleIds.length > 0) {
                    logger.info(`[Autorole] Cleaning up ${invalidRoleIds.length} invalid role(s) from guild ${interaction.guild!.name}`);
                    const updatedRoles = singleRoleIds.filter(id => !invalidRoleIds.includes(id));
                    await updateWelcomeConfig(client, guild.id, {
                        roleIds: updatedRoles
                    });
                }

                if (validRoles.length === 0) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [createAutoroleInfoEmbed(`ℹ️ Keine gültige Auto-Rolle gefunden. Ungültige Rollen wurden entfernt.${conflictSummary ?`\n\n⚠️ Hindernisse für die Einrichtung:\n${conflictSummary}`: ''}`)],
                        flags: MessageFlags.Ephemeral
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor(getColor('info'))
                    .setTitle('Automatisch vergebene Rolle')
                    .setDescription(`${validRoles[0]}${conflictSummary ?`\n\n⚠️ Hindernisse für die Einrichtung:\n${conflictSummary}`: ''}`)
                    .setFooter({ text: 'Es kann nur eine Auto-Rolle eingerichtet werden.' });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral
                });

            } catch (error) {
                logger.error(`[Autorole] Failed to list roles for guild ${guild.id}:`, error);
                await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Anzeigen der automatisch vergebenen Rollen ist ein Fehler aufgetreten. Bitte versuch es erneut.' });
            }
        }
    },
} satisfies Command;
