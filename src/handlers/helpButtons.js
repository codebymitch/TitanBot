import { MessageFlags } from 'discord.js';
import { createAllCommandsMenu } from './helpSelectMenus.js';
import { createInitialHelpMenu } from '../commands/Core/help.js';
import { createEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';

const VOICE_CMD_DETAILS = {
    activity:      { usage: '>activity [type]',       desc: 'Start a Discord Activity in your voice channel.\nAvailable types: `youtube`, `poker`, `chess`, `checkers`, `letter-league`, `spellcast`, `sketch`, `blazing8s`, `puttparty`, `landio`, `bobble`, `knowwhat`\n\n**Requires:** Create Invite in the voice channel' },
    vcmute:        { usage: '>vcmute @user',           desc: 'Server-mute a user so they cannot speak in voice.\n\n**Requires:** Mute Members' },
    vcunmute:      { usage: '>vcunmute @user',         desc: 'Remove server-mute from a user in voice.\n\n**Requires:** Mute Members' },
    vcdeafen:      { usage: '>vcdeafen @user',         desc: 'Server-deafen a user so they cannot hear in voice.\n\n**Requires:** Deafen Members' },
    vcundeafen:    { usage: '>vcundeafen @user',       desc: 'Remove server-deafen from a user in voice.\n\n**Requires:** Deafen Members' },
    drag:          { usage: '>drag @user',             desc: 'Pull a user from their voice channel into yours.\n\n**Requires:** Move Members' },
    moveall:       { usage: '>moveall #channel',       desc: 'Move all members from your current VC to another voice channel.\n\n**Requires:** Move Members' },
    vcname:        { usage: '>vcname <new name>',      desc: 'Rename your current voice channel.\n\n**Requires:** Manage Channels' },
    vclimit:       { usage: '>vclimit <0-99>',         desc: 'Set the user limit for your VC. Use `0` for unlimited.\n\n**Requires:** Manage Channels' },
    vcdisconnect:  { usage: '>vcdisconnect @user',     desc: 'Disconnect a user from voice. Alias: `>vckick`\n\n**Requires:** Move Members' },
    vclock:        { usage: '>vclock',                 desc: 'Lock your VC so no new members can join.\n\n**Requires:** Manage Channels' },
    vcunlock:      { usage: '>vcunlock',               desc: 'Unlock your VC to restore access.\n\n**Requires:** Manage Channels' },
    vcbitrate:     { usage: '>vcbitrate <8-384>',      desc: 'Set the bitrate of your voice channel in kbps (max depends on server boost level).\n\n**Requires:** Manage Channels' },
    vcinfo:        { usage: '>vcinfo',                 desc: 'Show information about your current voice channel: members, bitrate, lock status, and channel ID.' },
    muteall:       { usage: '>muteall',                desc: 'Server-mute all non-bot members in your VC.\n\n**Requires:** Mute Members' },
    unmuteall:     { usage: '>unmuteall',              desc: 'Remove server-mute from all members in your VC.\n\n**Requires:** Mute Members' },
    disconnectall: { usage: '>disconnectall',          desc: 'Disconnect everyone except yourself from your VC.\n\n**Requires:** Move Members' },
};

const COMMAND_LIST_ID = "help-command-list";
const BACK_BUTTON_ID = "help-back-to-main";
const PAGINATION_PREFIX = "help-page";

export const helpBackButton = {
    name: BACK_BUTTON_ID,
    async execute(interaction, client) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            const { embeds, components } = await createInitialHelpMenu(client, interaction.member);
            await interaction.editReply({
                embeds,
                components,
            });
        } catch (error) {
            if (error?.code === 40060 || error?.code === 10062) {
                logger.warn('Help back button interaction already acknowledged or expired.', {
                    event: 'interaction.help.button.unavailable',
                    errorCode: String(error.code),
                    customId: interaction.customId,
                    interactionId: interaction.id,
                });
                return;
            }

            throw error;
        }
    },
};


export const helpCmdButton = {
    name: 'help-cmd',
    async execute(interaction, client, args) {
        const displayName = args[0];
        if (!displayName) return;

        const [baseName, ...subParts] = displayName.split(' ');
        const command = client.commands.get(baseName);

        let description = 'No description available.';

        if (command) {
            const rawData = command.data;
            const jsonData = typeof rawData?.toJSON === 'function' ? rawData.toJSON() : rawData;
            description = jsonData?.description || description;

            let options = (jsonData?.options || []).map(o =>
                typeof o?.toJSON === 'function' ? o.toJSON() : o
            );
            for (const part of subParts) {
                const opt = options.find(o => o.name === part);
                if (opt) {
                    description = opt.description || description;
                    options = (opt.options || []).map(o =>
                        typeof o?.toJSON === 'function' ? o.toJSON() : o
                    );
                }
            }
        }

        const embed = createEmbed({
            title: `/${displayName}`,
            description,
            color: 'secondary',
        });

        await interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral,
        });
    }
};

function getPaginationInfo(components) {
    for (const row of components || []) {
        for (const component of row.components || []) {
            if (component.customId === `${PAGINATION_PREFIX}_page`) {
                const label = component.label || '';
                const match = label.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
                if (match) {
                    return {
                        currentPage: Number(match[1]),
                        totalPages: Number(match[2]),
                    };
                }
            }
        }
    }

    return { currentPage: 1, totalPages: 1 };
}

export const vcCmdButton = {
    name: 'vc-cmd',
    async execute(interaction, client, args) {
        const cmdName = args[0];
        const cmd = VOICE_CMD_DETAILS[cmdName];

        const embed = createEmbed({
            title: `>${cmdName}`,
            description: cmd
                ? `**Usage:** \`${cmd.usage}\`\n\n${cmd.desc}`
                : 'No details available for this command.',
            color: 'secondary',
        });

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },
};

export const helpPaginationButton = {
    name: `${PAGINATION_PREFIX}_next`,
    async execute(interaction, client) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            const { currentPage, totalPages } = getPaginationInfo(interaction.message?.components);

            let nextPage = currentPage;
            switch (interaction.customId) {
                case `${PAGINATION_PREFIX}_first`:
                    nextPage = 1;
                    break;
                case `${PAGINATION_PREFIX}_prev`:
                    nextPage = Math.max(1, currentPage - 1);
                    break;
                case `${PAGINATION_PREFIX}_next`:
                    nextPage = Math.min(totalPages, currentPage + 1);
                    break;
                case `${PAGINATION_PREFIX}_last`:
                    nextPage = totalPages;
                    break;
                default:
                    nextPage = currentPage;
                    break;
            }

            const { embeds, components } = await createAllCommandsMenu(nextPage, client, interaction.member);
            await interaction.editReply({ embeds, components });
        } catch (error) {
            if (error?.code === 40060 || error?.code === 10062) {
                logger.warn('Help pagination interaction already acknowledged or expired.', {
                    event: 'interaction.help.pagination.unavailable',
                    errorCode: String(error.code),
                    customId: interaction.customId,
                    interactionId: interaction.id,
                });
                return;
            }

            throw error;
        }
    },
};


