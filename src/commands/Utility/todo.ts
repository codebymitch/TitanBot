import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getFromDb, setInDb } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import crypto from 'crypto';
import type { Command } from '../../types/index.js';

/** Personal task stored under `todo_{userId}`. */
export interface TodoTask {
    id: number;
    text: string;
    completed: boolean;
    createdAt: string;
}

/** Stored under `todo_{userId}`. */
export interface TodoList {
    tasks: TodoTask[];
    nextId: number;
}

/** Task in a shared list. */
export interface SharedTodoTask extends TodoTask {
    createdBy: string;
    completedBy?: string;
}

/** Stored under `shared_todo_{listId}`. */
export interface SharedTodoList {
    id: string;
    name: string | null;
    creatorId: string;
    members: string[];
    tasks: SharedTodoTask[];
    nextId: number;
    createdAt: string;
    ok?: boolean;
    error?: unknown;
}

function generateShareId() {
    return crypto.randomBytes(16).toString('hex');
}

export default {
    data: new SlashCommandBuilder()
        .setName("todo")
        .setDescription("Verwalte deine persönliche To-do-Liste")
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Füge eine Aufgabe zu deiner To-do-Liste hinzu")
                .addStringOption(option =>
                    option
                        .setName("task")
                        .setDescription("Die Aufgabe, die du hinzufügen willst")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("list")
                .setDescription("Zeigt deine To-do-Liste an")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("complete")
                .setDescription("Markiere eine Aufgabe als erledigt")
                .addIntegerOption(option =>
                    option
                        .setName("number")
                        .setDescription("Die Nummer der erledigten Aufgabe")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Entferne eine Aufgabe von deiner To-do-Liste")
                .addIntegerOption(option =>
                    option
                        .setName("number")
                        .setDescription("Die Nummer der Aufgabe, die du entfernen willst")
                        .setRequired(true)
                )
        )
        .addSubcommandGroup(group => 
            group
                .setName("share")
                .setDescription("Verwalte geteilte To-do-Listen")
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("create")
                        .setDescription("Erstelle eine neue geteilte To-do-Liste")
                        .addStringOption(option =>
                            option
                                .setName("name")
                                .setDescription("Name der geteilten Liste")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("add")
                        .setDescription("Füge ein Mitglied zu einer geteilten Liste hinzu")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID der geteilten Liste")
                                .setRequired(true)
                        )
                        .addUserOption(option =>
                            option
                                .setName("user")
                                .setDescription("Nutzer, den du zur Liste hinzufügen willst")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("view")
                        .setDescription("Zeigt eine geteilte To-do-Liste an")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID der geteilten Liste")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("addtask")
                        .setDescription("Füge eine Aufgabe zu einer geteilten To-do-Liste hinzu")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID der geteilten Liste")
                                .setRequired(true)
                        )
                        .addStringOption(option =>
                            option
                                .setName("task")
                                .setDescription("Die Aufgabe, die du hinzufügen willst")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("remove")
                        .setDescription("Entferne eine Aufgabe von einer geteilten To-do-Liste")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID der geteilten Liste")
                                .setRequired(true)
                        )
                        .addIntegerOption(option =>
                            option
                                .setName("number")
                                .setDescription("Die Nummer der Aufgabe, die du entfernen willst")
                                .setRequired(true)
                        )
                )
        )
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
    category: "Utility",

    async execute(interaction, config, client) {
        const userId = interaction.user.id;
                const subcommand = interaction.options.getSubcommand();
                const shareSubcommand = interaction.options.getSubcommandGroup() === 'share' ? interaction.options.getSubcommand() : null;

        async function getOrCreateSharedList(listId: string, creatorId: string | null = null, listName: string | null = null): Promise<SharedTodoList | null> {
            const listKey = `shared_todo_${listId}`;
            let listData = await getFromDb<SharedTodoList>(listKey, null);
            
            if (!listData || (listData.ok === false && listData.error)) {
                if (creatorId) {
                    listData = {
                        id: listId,
                        name: listName,
                        creatorId,
                        members: [creatorId],
                        tasks: [],
                        nextId: 1,
                        createdAt: new Date().toISOString()
                    };
                    await setInDb(listKey, listData);
                } else {
                    return null;
                }
            }
            
            if (listData) {
                if (!Array.isArray(listData.tasks)) listData.tasks = [];
                if (!listData.nextId) listData.nextId = 1;
                if (!Array.isArray(listData.members)) listData.members = [];
            }
            
            return listData;
        }

        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Todo interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'todo'
            });
            return;
        }

        if (shareSubcommand) {
            switch (shareSubcommand) {
                case 'create': {
                    const listName = interaction.options.getString('name');
                    const listId = generateShareId();

                    await getOrCreateSharedList(listId, userId, listName);

                    const userSharedLists = await getFromDb<string[]>(`user_shared_lists_${userId}`, []);
                    const sharedListsArray = Array.isArray(userSharedLists) ? userSharedLists : [];
                    if (!sharedListsArray.includes(listId)) {
                        sharedListsArray.push(listId);
                        await setInDb(`user_shared_lists_${userId}`, sharedListsArray);
                    }

                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed(
                                "Geteilte Liste erstellt",
                                `Geteilte Liste „${listName}“ mit der ID \`${listId}\` erstellt.\n` +
                                `Nutze \`/todo share add list_id:${listId} user:@username\`, um Mitglieder hinzuzufügen.`
                            )
                        ]
                    });
                }

                case 'add': {
                    const listId = interaction.options.getString('list_id')!;
                    const memberToAdd = interaction.options.getUser('user')!;

                    const listData = await getOrCreateSharedList(listId);
                    if (!listData) {
                        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Geteilte Liste nicht gefunden.' });
                    }

                    if (listData.creatorId !== userId) {
                        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Nur wer die Liste erstellt hat, kann Mitglieder hinzufügen.' });
                    }

                    if (!listData.members.includes(memberToAdd.id)) {
                        listData.members.push(memberToAdd.id);
                        await setInDb(`shared_todo_${listId}`, listData);

                        const memberLists = await getFromDb<string[]>(`user_shared_lists_${memberToAdd.id}`, []);
                        const memberListsArray = Array.isArray(memberLists) ? memberLists : [];
                        if (!memberListsArray.includes(listId)) {
                            memberListsArray.push(listId);
                            await setInDb(`user_shared_lists_${memberToAdd.id}`, memberListsArray);
                        }

                        return await InteractionHelper.safeEditReply(interaction, {
                            embeds: [
                                successEmbed('Mitglied hinzugefügt', 
                                    `${memberToAdd.username} wurde zur geteilten Liste „${listData.name}“ hinzugefügt.`
                                )
                            ]
                        });
                    } else {
                        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Der Nutzer ist bereits Mitglied dieser Liste.' });
                    }
                }

                case 'view': {
                    const listId = interaction.options.getString('list_id')!;
                    const listData = await getOrCreateSharedList(listId);

                    if (!listData) {
                        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Geteilte Liste nicht gefunden.' });
                    }

                    if (!listData.members.includes(userId)) {
                        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Du hast keinen Zugriff auf diese Liste.' });
                    }

                    if (listData.tasks.length === 0) {
                        const memberList = listData.members.map(memberId => {
                            const member = interaction.guild!.members.cache.get(memberId);
                            return member ? member.user.username : `<@${memberId}>`;
                        }).join(',');

                        const owner = interaction.guild!.members.cache.get(listData.creatorId);
                        const ownerName = owner ? owner.user.username : `<@${listData.creatorId}>`;

                        return await InteractionHelper.safeEditReply(interaction, {
                                embeds: [
                                    successEmbed(
                                        `📋 **${listData.name}**\n\n` +
                                        `👑 **Inhaber:** ${ownerName}\n` +
                                        `👥 **Mitglieder:** ${memberList}\n\n` +
                                        `*Diese Liste ist gerade leer. Nutze den Button „Aufgabe hinzufügen“, um Aufgaben hinzuzufügen!*`,
                                        `Geteilte Liste (ID: \`${listId}\`)`
                                    )
                                ],
                                components: [
                                    new ActionRowBuilder<ButtonBuilder>().addComponents(
                                        new ButtonBuilder()
                                            .setCustomId(`shared_todo_add_${listId}`)
                                            .setLabel('Aufgabe hinzufügen')
                                            .setStyle(ButtonStyle.Primary),
                                        new ButtonBuilder()
                                            .setCustomId(`shared_todo_complete_${listId}`)
                                            .setLabel('Aufgabe erledigen')
                                            .setStyle(ButtonStyle.Success),
                                        new ButtonBuilder()
                                            .setCustomId(`shared_todo_remove_${listId}`)
                                            .setLabel('Aufgabe entfernen')
                                            .setStyle(ButtonStyle.Danger)
                                    )
                                ]
                            });
                    }

                    const taskList = listData.tasks
                        .map(task => 
                            `${task.completed ? '✅' : '📝'} #${task.id} ${task.text}` +
                            `\`[${new Date(task.createdAt).toLocaleDateString()}]` +
                            (task.completed ? `• Erledigt von ${task.completedBy}` : '') + '`'
                        )
                        .join('\n');

                    const memberList = listData.members.map(memberId => {
                        const member = interaction.guild!.members.cache.get(memberId);
                        return member ? member.user.username : `<@${memberId}>`;
                    }).join(',');

                    const owner = interaction.guild!.members.cache.get(listData.creatorId);
                    const ownerName = owner ? owner.user.username : `<@${listData.creatorId}>`;

                    const fullListDisplay = `📋 **${listData.name}**\n\n` +
                        `👑 **Inhaber:** ${ownerName}\n` +
                        `👥 **Mitglieder:** ${memberList}\n\n` +
                        `**Aufgaben:**\n${taskList}`;

                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed(`Geteilte Liste (ID: \`${listId}\`)`, fullListDisplay)
                        ],
                        components: [
                            new ActionRowBuilder<ButtonBuilder>().addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`shared_todo_add_${listId}`)
                                    .setLabel('Aufgabe hinzufügen')
                                    .setStyle(ButtonStyle.Primary),
                                new ButtonBuilder()
                                    .setCustomId(`shared_todo_complete_${listId}`)
                                    .setLabel('Aufgabe erledigen')
                                    .setStyle(ButtonStyle.Success),
                                new ButtonBuilder()
                                    .setCustomId(`shared_todo_remove_${listId}`)
                                    .setLabel('Aufgabe entfernen')
                                    .setStyle(ButtonStyle.Danger)
                            )
                        ]
                    });
                }

                case 'addtask': {
                    const listId = interaction.options.getString('list_id')!;
                    const taskText = interaction.options.getString('task')!;

                    const listData = await getOrCreateSharedList(listId);

                    if (!listData) {
                        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Geteilte Liste nicht gefunden.' });
                    }

                    if (!listData.members.includes(userId)) {
                        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Du hast keinen Zugriff auf diese Liste.' });
                    }

                    const newTask: SharedTodoTask = {
                        id: listData.nextId++,
                        text: taskText,
                        completed: false,
                        createdAt: new Date().toISOString(),
                        createdBy: userId
                    };

                    listData.tasks.push(newTask);
                    await setInDb(`shared_todo_${listId}`, listData);

                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed('Aufgabe hinzugefügt', `„${taskText}“ wurde zur geteilten Liste „${listData.name}“ hinzugefügt.`)
                        ]
                    });
                }

                case 'remove': {
                    const listId = interaction.options.getString('list_id')!;
                    const taskNumber = interaction.options.getInteger('number');

                    const listData = await getOrCreateSharedList(listId);

                    if (!listData) {
                        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Geteilte Liste nicht gefunden.' });
                    }

                    if (!listData.members.includes(userId)) {
                        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Du hast keinen Zugriff auf diese Liste.' });
                    }

                    const taskIndex = listData.tasks.findIndex(task => task.id === taskNumber);
                    if (taskIndex === -1) {
                        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Aufgabe nicht gefunden.' });
                    }

                    const [removedTask] = listData.tasks.splice(taskIndex, 1);
                    await setInDb(`shared_todo_${listId}`, listData);

                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed('Aufgabe entfernt', `„${removedTask.text}“ wurde aus der geteilten Liste „${listData.name}“ entfernt.`)
                        ]
                    });
                }
            }
            return;
        }

        const dbKey = `todo_${userId}`;

        const userData = await getFromDb<TodoList>(dbKey, {
            tasks: [],
            nextId: 1
        });

        if (!userData.tasks) userData.tasks = [];
        if (!userData.nextId) userData.nextId = 1;

        switch (subcommand) {
            case 'add': {
                const taskText = interaction.options.getString('task')!;

                const newTask: TodoTask = {
                    id: userData.nextId++,
                    text: taskText,
                    completed: false,
                    createdAt: new Date().toISOString()
                };

                userData.tasks.push(newTask);
                await setInDb(dbKey, userData);

                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            "Aufgabe hinzugefügt",
                            `„${taskText}“ wurde zu deiner To-do-Liste hinzugefügt.`
                        ),
                    ],
                });
            }

            case 'list': {
                if (userData.tasks.length === 0) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [successEmbed('Deine To-do-Liste ist leer!', "Deine To-do-Liste")],
                    });
                }

                const taskList = userData.tasks
                    .map(task => 
                        `${task.completed ? '✅' : '📝'} #${task.id} ${task.text}` +
                        `\`[${new Date(task.createdAt).toLocaleDateString()}\``
                    )
                    .join('\n');

                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed('Deine To-do-Liste', taskList)
                    ],
                });
            }

            case 'complete': {
                const taskNumber = interaction.options.getInteger('number');
                const task = userData.tasks.find(t => t.id === taskNumber);

                if (!task) {
                    return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Aufgabe nicht gefunden.' });
                }

                if (task.completed) {
                    return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Aufgabe #${task.id} ist bereits erledigt.` });
                }

                task.completed = true;
                await setInDb(`todo_${userId}`, userData);

                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed('Aufgabe erledigt', `„${task.text}“ ist als erledigt markiert!`)
                    ],
                });
            }

            case 'remove': {
                const taskNumber = interaction.options.getInteger('number');
                const taskIndex = userData.tasks.findIndex(t => t.id === taskNumber);

                if (taskIndex === -1) {
                    return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Aufgabe nicht gefunden.' });
                }

                const [removedTask] = userData.tasks.splice(taskIndex, 1);
                await setInDb(`todo_${userId}`, userData);

                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed('Aufgabe entfernt', `„${removedTask.text}“ wurde von deiner To-do-Liste entfernt.`)
                    ],
                });
            }

            default:
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Ungültiger Subcommand.' });
        }
    },
} satisfies Command;