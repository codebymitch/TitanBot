import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getFromDb, setInDb } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { t, pickLanguage } from '../../services/i18n.js';
import crypto from 'crypto';

function generateShareId() {
    return crypto.randomBytes(16).toString('hex');
}

export default {
    data: new SlashCommandBuilder()
        .setName("todo")
        .setDescription("Manage your personal to-do list")
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Add a task to your to-do list")
                .addStringOption(option =>
                    option
                        .setName("task")
                        .setDescription("The task to add")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("list")
                .setDescription("View your to-do list")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("complete")
                .setDescription("Mark a task as complete")
                .addIntegerOption(option =>
                    option
                        .setName("number")
                        .setDescription("The number of the task to complete")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Remove a task from your to-do list")
                .addIntegerOption(option =>
                    option
                        .setName("number")
                        .setDescription("The number of the task to remove")
                        .setRequired(true)
                )
        )
        .addSubcommandGroup(group => 
            group
                .setName("share")
                .setDescription("Manage shared to-do lists")
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("create")
                        .setDescription("Create a new shared to-do list")
                        .addStringOption(option =>
                            option
                                .setName("name")
                                .setDescription("Name for the shared list")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("add")
                        .setDescription("Add a member to a shared list")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID of the shared list")
                                .setRequired(true)
                        )
                        .addUserOption(option =>
                            option
                                .setName("user")
                                .setDescription("User to add to the list")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("view")
                        .setDescription("View a shared to-do list")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID of the shared list")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("addtask")
                        .setDescription("Add a task to a shared to-do list")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID of the shared list")
                                .setRequired(true)
                        )
                        .addStringOption(option =>
                            option
                                .setName("task")
                                .setDescription("The task to add")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("remove")
                        .setDescription("Remove a task from a shared to-do list")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID of the shared list")
                                .setRequired(true)
                        )
                        .addIntegerOption(option =>
                            option
                                .setName("number")
                                .setDescription("The number of the task to remove")
                                .setRequired(true)
                        )
                )
        )
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
    category: "Utility",

    async execute(interaction, config, client) {
        const lang = pickLanguage(config, interaction.guild);
        const userId = interaction.user.id;
        const subcommand = interaction.options.getSubcommand();
        const shareSubcommand = interaction.options.getSubcommandGroup() === 'share' ? interaction.options.getSubcommand() : null;

        async function getOrCreateSharedList(listId, creatorId = null, listName = null) {
            const listKey = `shared_todo_${listId}`;
            let listData = await getFromDb(listKey, null);
            
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

        function buildShareButtons(listId) {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`shared_todo_add_${listId}`)
                    .setLabel(t(lang, 'wolf.cmd.utility.todo.btnAddTask'))
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`shared_todo_complete_${listId}`)
                    .setLabel(t(lang, 'wolf.cmd.utility.todo.btnCompleteTask'))
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`shared_todo_remove_${listId}`)
                    .setLabel(t(lang, 'wolf.cmd.utility.todo.btnRemoveTask'))
                    .setStyle(ButtonStyle.Danger)
            );
        }

        try {
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
                        
                        const userSharedLists = await getFromDb(`user_shared_lists_${userId}`, []);
                        const sharedListsArray = Array.isArray(userSharedLists) ? userSharedLists : [];
                        if (!sharedListsArray.includes(listId)) {
                            sharedListsArray.push(listId);
                            await setInDb(`user_shared_lists_${userId}`, sharedListsArray);
                        }
                        
                        return await InteractionHelper.safeEditReply(interaction, {
                            embeds: [
                                successEmbed(
                                    t(lang, 'wolf.cmd.utility.todo.shareCreatedTitle'),
                                    t(lang, 'wolf.cmd.utility.todo.shareCreatedDesc', { name: listName, id: listId })
                                )
                            ]
                        });
                    }
                    
                    case 'add': {
                        const listId = interaction.options.getString('list_id');
                        const memberToAdd = interaction.options.getUser('user');
                        
                        const listData = await getOrCreateSharedList(listId);
                        if (!listData) {
                            return await InteractionHelper.safeEditReply(interaction, {
                                embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.shareNotFound'))]
                            });
                        }
                        
                        if (listData.creatorId !== userId) {
                            return await InteractionHelper.safeEditReply(interaction, {
                                embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.shareOnlyCreator'))]
                            });
                        }
                        
                        if (!listData.members.includes(memberToAdd.id)) {
                            listData.members.push(memberToAdd.id);
                            await setInDb(`shared_todo_${listId}`, listData);
                            
                            const memberLists = await getFromDb(`user_shared_lists_${memberToAdd.id}`, []);
                            const memberListsArray = Array.isArray(memberLists) ? memberLists : [];
                            if (!memberListsArray.includes(listId)) {
                                memberListsArray.push(listId);
                                await setInDb(`user_shared_lists_${memberToAdd.id}`, memberListsArray);
                            }
                            
                            return await InteractionHelper.safeEditReply(interaction, {
                                embeds: [
                                    successEmbed(
                                        t(lang, 'wolf.cmd.utility.todo.shareMemberAddedTitle'),
                                        t(lang, 'wolf.cmd.utility.todo.shareMemberAddedDesc', { user: memberToAdd.username, name: listData.name })
                                    )
                                ]
                            });
                        } else {
                            return await InteractionHelper.safeEditReply(interaction, {
                                embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.shareAlreadyMember'))]
                            });
                        }
                    }
                    
                    case 'view': {
                        const listId = interaction.options.getString('list_id');
                        const listData = await getOrCreateSharedList(listId);
                        
                        if (!listData) {
                            return await InteractionHelper.safeEditReply(interaction, {
                                embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.shareNotFound'))]
                            });
                        }
                        
                        if (!listData.members.includes(userId)) {
                            return await InteractionHelper.safeEditReply(interaction, {
                                embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.shareNoAccess'))]
                            });
                        }
                        
                        const memberList = listData.members.map(memberId => {
                            const member = interaction.guild.members.cache.get(memberId);
                            return member ? member.user.username : `<@${memberId}>`;
                        }).join(', ');
                        
                        const owner = interaction.guild.members.cache.get(listData.creatorId);
                        const ownerName = owner ? owner.user.username : `<@${listData.creatorId}>`;
                        const idLabel = t(lang, 'wolf.cmd.utility.todo.shareViewIdLabel', { id: listId });

                        if (listData.tasks.length === 0) {
                            return await InteractionHelper.safeEditReply(interaction, {
                                embeds: [
                                    successEmbed(
                                        t(lang, 'wolf.cmd.utility.todo.shareViewEmptyBody', { name: listData.name, owner: ownerName, members: memberList }),
                                        idLabel
                                    )
                                ],
                                components: [buildShareButtons(listId)]
                            });
                        }
                        
                        const taskList = listData.tasks
                            .map(task => 
                                `${task.completed ? '✅' : '📝'} #${task.id} ${task.text} ` +
                                `\`[${new Date(task.createdAt).toLocaleDateString()}]` +
                                (task.completed ? ` • Completed by ${task.completedBy}` : '') + '`'
                            )
                            .join('\n');

                        return await InteractionHelper.safeEditReply(interaction, {
                            embeds: [
                                successEmbed(
                                    t(lang, 'wolf.cmd.utility.todo.shareViewBody', { name: listData.name, owner: ownerName, members: memberList, tasks: taskList }),
                                    idLabel
                                )
                            ],
                            components: [buildShareButtons(listId)]
                        });
                    }
                    
                    case 'addtask': {
                        const listId = interaction.options.getString('list_id');
                        const taskText = interaction.options.getString('task');
                        
                        const listData = await getOrCreateSharedList(listId);
                        
                        if (!listData) {
                            return await InteractionHelper.safeEditReply(interaction, {
                                embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.shareNotFound'))]
                            });
                        }
                        
                        if (!listData.members.includes(userId)) {
                            return await InteractionHelper.safeEditReply(interaction, {
                                embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.shareNoAccess'))]
                            });
                        }
                        
                        const newTask = {
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
                                successEmbed(
                                    t(lang, 'wolf.cmd.utility.todo.shareTaskAddedTitle'),
                                    t(lang, 'wolf.cmd.utility.todo.shareTaskAddedDesc', { task: taskText, name: listData.name })
                                )
                            ]
                        });
                    }

                    case 'remove': {
                        const listId = interaction.options.getString('list_id');
                        const taskNumber = interaction.options.getInteger('number');

                        const listData = await getOrCreateSharedList(listId);

                        if (!listData) {
                            return await InteractionHelper.safeEditReply(interaction, {
                                embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.shareNotFound'))]
                            });
                        }

                        if (!listData.members.includes(userId)) {
                            return await InteractionHelper.safeEditReply(interaction, {
                                embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.shareNoAccess'))]
                            });
                        }

                        const taskIndex = listData.tasks.findIndex(task => task.id === taskNumber);
                        if (taskIndex === -1) {
                            return await InteractionHelper.safeEditReply(interaction, {
                                embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.taskNotFound'))]
                            });
                        }

                        const [removedTask] = listData.tasks.splice(taskIndex, 1);
                        await setInDb(`shared_todo_${listId}`, listData);

                        return await InteractionHelper.safeEditReply(interaction, {
                            embeds: [
                                successEmbed(
                                    t(lang, 'wolf.cmd.utility.todo.shareTaskRemovedTitle'),
                                    t(lang, 'wolf.cmd.utility.todo.shareTaskRemovedDesc', { task: removedTask.text, name: listData.name })
                                )
                            ]
                        });
                    }
                }
                return;
            }

            const dbKey = `todo_${userId}`;
            
            const userData = await getFromDb(dbKey, {
                tasks: [],
                nextId: 1
            });
            
            if (!userData.tasks) userData.tasks = [];
            if (!userData.nextId) userData.nextId = 1;

            switch (subcommand) {
                case 'add': {
                    const taskText = interaction.options.getString('task');
                    
                    const newTask = {
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
                                t(lang, 'wolf.cmd.utility.todo.addTitle'),
                                t(lang, 'wolf.cmd.utility.todo.addDesc', { task: taskText })
                            ),
                        ],
                    });
                }

                case 'list': {
                    if (userData.tasks.length === 0) {
                        return await InteractionHelper.safeEditReply(interaction, {
                            embeds: [successEmbed(t(lang, 'wolf.cmd.utility.todo.listEmptyTitle'), t(lang, 'wolf.cmd.utility.todo.listTitle'))],
                        });
                    }

                    const taskList = userData.tasks
                        .map(task => 
                            `${task.completed ? '✅' : '📝'} #${task.id} ${task.text} ` +
                            `\`[${new Date(task.createdAt).toLocaleDateString()}\``
                        )
                        .join('\n');

                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed(taskList, t(lang, 'wolf.cmd.utility.todo.listTitle'))
                        ],
                    });
                }

                case 'complete': {
                    const taskNumber = interaction.options.getInteger('number');
                    const task = userData.tasks.find(t => t.id === taskNumber);
                    
                    if (!task) {
                        return await InteractionHelper.safeEditReply(interaction, {
                            embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.taskNotFound'))],
                        });
                    }

                    if (task.completed) {
                        return await InteractionHelper.safeEditReply(interaction, {
                            embeds: [errorEmbed(
                                t(lang, 'wolf.cmd.utility.todo.errorTitle'),
                                t(lang, 'wolf.cmd.utility.todo.alreadyCompleted', { id: task.id })
                            )],
                        });
                    }
                    
                    task.completed = true;
                    await setInDb(`todo_${userId}`, userData);
                    
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed(
                                t(lang, 'wolf.cmd.utility.todo.completeTitle'),
                                t(lang, 'wolf.cmd.utility.todo.completeDesc', { task: task.text })
                            )
                        ],
                    });
                }

                case 'remove': {
                    const taskNumber = interaction.options.getInteger('number');
                    const taskIndex = userData.tasks.findIndex(t => t.id === taskNumber);
                    
                    if (taskIndex === -1) {
                        return await InteractionHelper.safeEditReply(interaction, {
                            embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.taskNotFound'))],
                        });
                    }
                    
                    const [removedTask] = userData.tasks.splice(taskIndex, 1);
                    await setInDb(`todo_${userId}`, userData);
                    
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed(
                                t(lang, 'wolf.cmd.utility.todo.removeTitle'),
                                t(lang, 'wolf.cmd.utility.todo.removeDesc', { task: removedTask.text })
                            )
                        ],
                    });
                }

                default:
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.invalidSubcommand'))],
                    });
            }
        } catch (error) {
            logger.error(`Todo command execution failed`, {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'todo'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'todo',
                source: 'todo_command'
            });
        }
    },
};
