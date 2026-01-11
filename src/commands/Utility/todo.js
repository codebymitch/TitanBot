import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Helper function to generate a unique ID for shared lists
function generateShareId() {
    return Math.random().toString(36).substring(2, 9);
}

// Migrated from: commands/Utility/todo.js
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
                        .setName("id")
                        .setDescription("The ID of the task to complete")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Remove a task from your to-do list")
                .addIntegerOption(option =>
                    option
                        .setName("id")
                        .setDescription("The ID of the task to remove")
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
        )
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
    category: "Utility",

    async execute(interaction, config, client) {
        await interaction.deferReply({ ephemeral: true });

        const userId = interaction.user.id;
        const subcommand = interaction.options.getSubcommand();
        const shareSubcommand = interaction.options.getSubcommandGroup() === 'share' ? interaction.options.getSubcommand() : null;

        // Helper function to get or create shared list
        async function getOrCreateSharedList(listId, creatorId = null, listName = null) {
            const listKey = `shared_todo_${listId}`;
            let listData = await client.db.get(listKey);
            
            if (!listData && creatorId) {
                listData = {
                    id: listId,
                    name: listName,
                    creatorId,
                    members: [creatorId],
                    tasks: [],
                    nextId: 1,
                    createdAt: new Date().toISOString()
                };
                await client.db.set(listKey, listData);
            }
            
            return listData;
        }

        try {
            // For share subcommands, handle them separately
            if (shareSubcommand) {
                switch (shareSubcommand) {
                    case 'create': {
                        const listName = interaction.options.getString('name');
                        const listId = generateShareId();
                        
                        await getOrCreateSharedList(listId, userId, listName);
                        
                        // Add this list to user's shared lists
                        const userSharedLists = await client.db.get(`user_shared_lists_${userId}`) || [];
                        if (!userSharedLists.includes(listId)) {
                            userSharedLists.push(listId);
                            await client.db.set(`user_shared_lists_${userId}`, userSharedLists);
                        }
                        
                        return interaction.editReply({
                            embeds: [
                                successEmbed(
                                    "Shared List Created",
                                    `Created shared list "${listName}" with ID: \`${listId}\`\n` +
                                    `Use \`/todo share add list_id:${listId} user:@username\` to add members.`
                                )
                            ]
                        });
                    }
                    
                    case 'add': {
                        const listId = interaction.options.getString('list_id');
                        const memberToAdd = interaction.options.getUser('user');
                        
                        const listData = await getOrCreateSharedList(listId);
                        if (!listData) {
                            return interaction.editReply({
                                embeds: [errorEmbed("Error", "Shared list not found.")]
                            });
                        }
                        
                        // Check if user is the creator or has permission
                        if (listData.creatorId !== userId) {
                            return interaction.editReply({
                                embeds: [errorEmbed("Error", "Only the list creator can add members.")]
                            });
                        }
                        
                        // Add member if not already added
                        if (!listData.members.includes(memberToAdd.id)) {
                            listData.members.push(memberToAdd.id);
                            await client.db.set(`shared_todo_${listId}`, listData);
                            
                            // Add list to member's shared lists
                            const memberLists = await client.db.get(`user_shared_lists_${memberToAdd.id}`) || [];
                            if (!memberLists.includes(listId)) {
                                memberLists.push(listId);
                                await client.db.set(`user_shared_lists_${memberToAdd.id}`, memberLists);
                            }
                            
                            return interaction.editReply({
                                embeds: [
                                    successEmbed("Member Added", 
                                        `Added ${memberToAdd.username} to the shared list "${listData.name}"`
                                    )
                                ]
                            });
                        } else {
                            return interaction.editReply({
                                embeds: [errorEmbed("Error", "User is already a member of this list.")]
                            });
                        }
                    }
                    
                    case 'view': {
                        const listId = interaction.options.getString('list_id');
                        const listData = await getOrCreateSharedList(listId);
                        
                        if (!listData) {
                            return interaction.editReply({
                                embeds: [errorEmbed("Error", "Shared list not found.")]
                            });
                        }
                        
                        // Check if user is a member
                        if (!listData.members.includes(userId)) {
                            return interaction.editReply({
                                embeds: [errorEmbed("Error", "You don't have access to this list.")]
                            });
                        }
                        
                        if (listData.tasks.length === 0) {
                            return interaction.editReply({
                                embeds: [
                                    successEmbed(
                                        `Shared List: ${listData.name}`, 
                                        "This list is currently empty!"
                                    )
                                ]
                            });
                        }
                        
                        const taskList = listData.tasks
                            .map(task => 
                                `${task.completed ? '✅' : '📝'} ${task.id}. ${task.text} ` +
                                `\`[${new Date(task.createdAt).toLocaleDateString()}]` +
                                (task.completed ? ` • Completed by ${task.completedBy}` : '') + '`'
                            )
                            .join('\n');
                            
                        return interaction.editReply({
                            embeds: [
                                successEmbed(
                                    `Shared List: ${listData.name}`, 
                                    taskList
                                )
                            ],
                            components: [
                                new ActionRowBuilder().addComponents(
                                    new ButtonBuilder()
                                        .setCustomId(`shared_todo_add_${listId}`)
                                        .setLabel('Add Task')
                                        .setStyle(ButtonStyle.Primary),
                                    new ButtonBuilder()
                                        .setCustomId(`shared_todo_complete_${listId}`)
                                        .setLabel('Complete Task')
                                        .setStyle(ButtonStyle.Success)
                                )
                            ]
                        });
                    }
                }
                return;
            }

            // Handle regular todo commands
            const userData = await client.db.get(`todo_${userId}`) || {
                tasks: [],
                nextId: 1
            };

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
                    await client.db.set(`todo_${userId}`, userData);
                    
                    return interaction.editReply({
                        embeds: [
                            successEmbed(
                                "Task Added",
                                `Added "${taskText}" to your to-do list.`
                            ),
                        ],
                    });
                }

                case 'list': {
                    if (userData.tasks.length === 0) {
                        return interaction.editReply({
                            embeds: [successEmbed("Your To-Do List", "Your to-do list is empty!")],
                        });
                    }

                    const taskList = userData.tasks
                        .map(task => 
                            `${task.completed ? '✅' : '📝'} ${task.id}. ${task.text} ` +
                            `\`[${new Date(task.createdAt).toLocaleDateString()}]\``
                        )
                        .join('\n');

                    return interaction.editReply({
                        embeds: [
                            successEmbed("Your To-Do List", taskList)
                        ],
                    });
                }

                case 'complete': {
                    const taskId = interaction.options.getInteger('id');
                    const task = userData.tasks.find(t => t.id === taskId);
                    
                    if (!task) {
                        return interaction.editReply({
                            embeds: [errorEmbed("Error", "Task not found.")],
                        });
                    }
                    
                    task.completed = true;
                    await client.db.set(`todo_${userId}`, userData);
                    
                    return interaction.editReply({
                        embeds: [
                            successEmbed("Task Completed", `Marked "${task.text}" as complete!`)
                        ],
                    });
                }

                case 'remove': {
                    const taskId = interaction.options.getInteger('id');
                    const taskIndex = userData.tasks.findIndex(t => t.id === taskId);
                    
                    if (taskIndex === -1) {
                        return interaction.editReply({
                            embeds: [errorEmbed("Error", "Task not found.")],
                        });
                    }
                    
                    const [removedTask] = userData.tasks.splice(taskIndex, 1);
                    await client.db.set(`todo_${userId}`, userData);
                    
                    return interaction.editReply({
                        embeds: [
                            successEmbed("Task Removed", `Removed "${removedTask.text}" from your to-do list.`)
                        ],
                    });
                }

                default:
                    return interaction.editReply({
                        embeds: [errorEmbed("Error", "Invalid subcommand.")],
                    });
            }
        } catch (error) {
            console.error("Error in todo command:", error);
            return interaction.editReply({
                embeds: [errorEmbed("Error", "An error occurred while processing your request.")],
            });
        }
    },
};
