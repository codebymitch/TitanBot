import {
    Client,
    GatewayIntentBits,
    Collection,
    REST,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
} from "discord.js";
import { Routes } from 'discord-api-types/v10';
import {
    initializeDatabase,
    getGuildConfig,
    getAFKKey,
    // --- 1. Import giveaway utility functions ---
    giveawayKey,
    getGuildGiveaways,
    handleReactionRoles,
    // Import welcome system event handlers
    handleGuildMemberAdd,
    handleGuildMemberRemove
} from "./utils.js";
import {
    createEmbed,
    errorEmbed,
    successEmbed,
    getLevelingConfig,
    getUserLevelData,
    saveUserLevelData,
    getXpForLevel,
    addXp,
    getServerCounters,
    saveServerCounters,
    updateCounter,
} from "./utils.js";
import { BotConfig, getActivityType } from "./bot_config.js";
import express from "express";
import { handleCountdownInteraction } from "./commands/Tools/countdown.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";

// Initialize REST client
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

// --- 1. REPLIT KEEP-ALIVE SERVER ---
const app = express();
app.get("/", (req, res) => res.send("TitanBot System Online"));
app.listen(3000, () => console.log("🌐 Web Server is ready."));

// --- BIRTHDAY SYSTEM CORE LOGIC (UNCHANGED) ---

async function checkBirthdays(client) {
    const today = new Date();
    // Use UTC for consistent scheduling across all environments
    const currentMonth = today.getUTCMonth() + 1; // getUTCMonth is 0-indexed
    const currentDay = today.getUTCDate();

    console.log(
        `🎂 Running daily birthday check for UTC: ${currentMonth}/${currentDay}.`,
    );

    for (const [guildId, guild] of client.guilds.cache) {
        try {
            const config = await client.getGuildConfig(client, guildId);
            const { birthdayChannelId, birthdayRoleId } = config;

            if (!birthdayChannelId || !birthdayRoleId) {
                console.log(
                    `Skipping birthday check for ${guild.name}: Missing channel or role config.`,
                );
                continue;
            }

            const channel = await guild.channels
                .fetch(birthdayChannelId)
                .catch(() => null);
            if (!channel) continue;

            // --- 1. ROLE REMOVAL (Cleanup from yesterday) ---
            const trackingKey = `bday-role-tracking-${guildId}`;
            const trackingData = (await client.db.get(trackingKey)) || {};
            const updatedTrackingData = { ...trackingData };

            for (const userId of Object.keys(trackingData)) {
                try {
                    const member = await guild.members
                        .fetch(userId)
                        .catch(() => null);

                    if (member && member.roles.cache.has(birthdayRoleId)) {
                        await member.roles.remove(
                            birthdayRoleId,
                            "Birthday role cleanup.",
                        );
                        console.log(
                            `✅ Removed birthday role from ${member.user.tag} in ${guild.name}.`,
                        );
                    }
                    // Remove the user from tracking whether they had the role or not.
                    delete updatedTrackingData[userId];
                } catch (error) {
                    console.error(
                        `Failed to remove birthday role from user ${userId} in ${guild.name}:`,
                        error,
                    );
                }
            }
            // Save updated tracking data (clearing removed users)
            if (Object.keys(trackingData).length > 0) {
                await client.db.set(trackingKey, updatedTrackingData);
            }

            // --- 2. BIRTHDAY CHECK AND ROLE GRANTING (Today's birthdays) ---
            const newTracking = {};
            const todayBirthdays = [];

            // Fetch all members to check their birthdays (Replit DB key check is hard without an index)
            const members = await guild.members
                .fetch()
                .catch(() => new Collection());

            for (const [userId, member] of members) {
                if (member.user.bot) continue;

                const bdayKey = `birthday-${userId}`;
                const bdayData = await client.db.get(bdayKey);

                if (
                    bdayData &&
                    bdayData.month === currentMonth &&
                    bdayData.day === currentDay
                ) {
                    todayBirthdays.push(member);

                    // Grant Role
                    try {
                        const role = guild.roles.cache.get(birthdayRoleId);
                        if (role) {
                            await member.roles.add(
                                role,
                                "It's their birthday!",
                            );
                            console.log(
                                `🎉 Granted birthday role to ${member.user.tag} in ${guild.name}.`,
                            );
                            newTracking[userId] = Date.now(); // Track for removal tomorrow
                        }
                    } catch (e) {
                        console.error(
                            `Failed to grant birthday role to ${member.user.tag}:`,
                            e,
                        );
                    }
                }
            }

            // Update tracking data for today's birthdays
            if (Object.keys(newTracking).length > 0) {
                // Merge new tracking data with any potential existing data (should be empty after cleanup)
                await client.db.set(trackingKey, {
                    ...updatedTrackingData,
                    ...newTracking,
                });
            }

            // --- 3. POST MESSAGE ---
            if (todayBirthdays.length > 0) {
                const mentions = todayBirthdays
                    .map((m) => m.toString())
                    .join(", ");
                const birthdayRoleMention = `<@&${birthdayRoleId}>`;

                const bdayEmbed = new EmbedBuilder()
                    .setTitle(
                        `🥳 Happy Birthday to ${todayBirthdays.length > 1 ? "these members" : "a great member"}! 🎂`,
                    )
                    .setDescription(
                        `Please join us in wishing a very special day to ${mentions}!`,
                    )
                    .setColor("#FEE75C")
                    .setTimestamp();

                if (todayBirthdays.length === 1) {
                    bdayEmbed.setThumbnail(
                        todayBirthdays[0].user.displayAvatarURL({
                            dynamic: true,
                        }),
                    );
                }

                await channel.send({
                    content: `${birthdayRoleMention} - It's time to celebrate!`,
                    embeds: [bdayEmbed],
                });
                console.log(
                    `🎁 Posted ${todayBirthdays.length} birthday announcement(s) in ${guild.name}.`,
                );
            }
        } catch (err) {
            console.error(
                `Error processing birthdays for guild ${guildId}:`,
                err,
            );
        }
    }
}
// --- END BIRTHDAY SYSTEM CORE LOGIC ---

// --- GIVEAWAY SYSTEM CORE LOGIC (FIXED) ---
function pickWinners(participants, count) {
    if (participants.length === 0 || count <= 0) return [];

    // Filter out potential duplicates and shuffle the array
    const uniqueParticipants = [...new Set(participants)];
    const shuffled = uniqueParticipants.sort(() => 0.5 - Math.random());

    // Return a slice of the shuffled array (up to the required count)
    return shuffled.slice(0, Math.min(count, uniqueParticipants.length));
}

/**
 * Checks for and ends expired giveaways across all guilds.
 * Runs every minute via cron job.
 * @param {Client} client The Discord client instance.
 */
async function checkGiveaways(client) {
    const now = Date.now();
    const allGuilds = client.guilds.cache;
    let totalActiveGiveaways = 0;
    const guildsWithGiveaways = [];

    // First pass: Count active giveaways
    for (const [guildId, guild] of allGuilds) {
        try {
            const guildGiveawayKey = giveawayKey(guildId);
            const result = await client.db.get(guildGiveawayKey);
            const activeGiveaways = result?.value || result || {};
            const giveawayCount = Object.keys(activeGiveaways).length;

            if (giveawayCount > 0) {
                totalActiveGiveaways += giveawayCount;
                guildsWithGiveaways.push(guild.name);
            }
        } catch (error) {
            console.error(
                `Error counting giveaways for guild ${guildId}:`,
                error,
            );
        }
    }

    // Log summary only if there are active giveaways
    if (totalActiveGiveaways > 0) {
        console.log(
            `🎁 Checking ${totalActiveGiveaways} active giveaway(s) across ${guildsWithGiveaways.length} guild(s).`,
        );
    }

    // Second pass: Process giveaways
    for (const [guildId, guild] of allGuilds) {
        try {
            const guildGiveawayKey = giveawayKey(guildId);
            const result = await client.db.get(guildGiveawayKey);
            const activeGiveaways = result?.value || result || {};

            if (Object.keys(activeGiveaways).length === 0) continue;

            let giveawaysUpdated = false;
            const giveawaysToEnd = [];

            // Create a temporary copy to modify/delete in the loop
            const tempGiveaways = { ...activeGiveaways };

            // Identify expired giveaways
            // Identify expired giveaways
            // Add a small buffer (5 seconds) to account for processing time
            const bufferTime = 5000; // 5 seconds in milliseconds
            const currentTimeWithBuffer = now + bufferTime;

            for (const [messageId, data] of Object.entries(activeGiveaways)) {
                // Skip invalid/corrupted giveaway entries
                if (!data || typeof data !== "object" || !data.endTime) {
                    delete tempGiveaways[messageId]; // Clean up corrupted entry
                    giveawaysUpdated = true;
                    continue;
                }

                // Check if giveaway should end, including the buffer time
                if (data.endTime <= currentTimeWithBuffer) {
                    giveawaysToEnd.push({ messageId, ...data });
                    // Mark the giveaway for deletion from the active list
                    delete tempGiveaways[messageId];
                    giveawaysUpdated = true;
                }
            }

            if (giveawaysUpdated) {
                // Save the cleaned/updated list back to the DB before processing endings
                await client.db.set(guildGiveawayKey, tempGiveaways);
            }

            if (giveawaysToEnd.length > 0) {
                console.log(
                    `[${guild.name}] Ending ${giveawaysToEnd.length} giveaway(s)`,
                );
            } else {
                continue;
            }

            for (const giveaway of giveawaysToEnd) {
                const { messageId, channelId, prize, winnerCount, hostId } =
                    giveaway;

                // Ensure participants is always an array and winnerCount has a fallback
                const participants = giveaway.participants || [];
                const effectiveWinnerCount = winnerCount || 1;

                // --- Giveaway Ending Logic ---

                const channel = await guild.channels
                    .fetch(channelId)
                    .catch(() => null);

                if (!channel || channel.type !== ChannelType.GuildText) {
                    console.error(
                        `[${guild.name}] Could not find channel ${channelId} for giveaway ${messageId}. Skipping announcement.`,
                    );
                    continue;
                }

                // Try to fetch the giveaway message
                const message = await channel.messages
                    .fetch(messageId)
                    .catch(() => null);

                // 1. Pick the winners
                const pickedWinners = pickWinners(
                    participants,
                    effectiveWinnerCount,
                );

                // 2. Update the giveaway data with winners and ended status
                const endedGiveaway = {
                    ...giveaway,
                    isEnded: true,
                    endedAt: Date.now(),
                    winnerIds: pickedWinners,
                };

                // 3. Save the updated giveaway data
                // We don't need to save the ended giveaway back to the database
                // as we want to completely remove it to prevent duplicate processing
                const guildGiveawayKey = giveawayKey(guildId);
                // The giveaway is already removed from tempGiveaways, so we can just save that
                await client.db.set(guildGiveawayKey, tempGiveaways);

                // 4. Construct Winner Announcement Embed
                let winnerMessage;
                if (pickedWinners.length > 0) {
                    const winnerMentions = pickedWinners
                        .map((id) => `<@${id}>`)
                        .join(", ");
                    winnerMessage = `Congratulations ${winnerMentions}! You won **${prize}**!`;
                } else {
                    winnerMessage = `No one won **${prize}** because there were no valid entries.`;
                }

                const announcementEmbed = new EmbedBuilder()
                    .setTitle(`🎉 GIVEAWAY ENDED: ${prize}`)
                    .setDescription(winnerMessage)
                    .addFields(
                        {
                            name: "Hosted By",
                            value: `<@${hostId}>`,
                            inline: true,
                        },
                        {
                            name: "Entries",
                            value: `${participants.length}`,
                            inline: true,
                        },
                        {
                            name: "Winners",
                            value: `${pickedWinners.length}`,
                            inline: true,
                        },
                    )
                    .setColor(pickedWinners.length > 0 ? "#2ECC71" : "#E74C3C")
                    .setTimestamp();

                // 3. Send the announcement in the channel
                await channel.send({
                    content:
                        pickedWinners.length > 0
                            ? `We have a winner for the **${prize}** giveaway!`
                            : `The **${prize}** giveaway has ended.`,
                    embeds: [announcementEmbed],
                    reply: message
                        ? {
                              messageReference: message.id,
                              failIfNotExists: false,
                          }
                        : undefined,
                });

                // 4. Update the original message embed (if it still exists)
                if (message) {
                    const updatedEmbed = message.embeds[0]
                        ? EmbedBuilder.from(message.embeds[0])
                        : new EmbedBuilder();

                    updatedEmbed.setTitle(
                        `[ENDED] ${updatedEmbed.data.title || prize}`,
                    );
                    updatedEmbed.setDescription(
                        `Hosted by <@${hostId}>\n\n**Winner(s):** ${pickedWinners.length > 0 ? pickedWinners.map((id) => `<@${id}>`).join(", ") : "No winners."}`,
                    );
                    updatedEmbed.setColor("#34495E");
                    updatedEmbed.setFooter({
                        text: `Giveaway ended | ${participants.length} Entries`,
                    });
                    updatedEmbed.setTimestamp();

                    // Remove the button component
                    await message.edit({
                        embeds: [updatedEmbed],
                        components: [],
                    });
                }

                // NOTE: Database cleanup is now handled *before* the loop starts processing endings,
                // when the activeGiveaways list is saved back to the DB.
                // This prevents race conditions where the check might run again before processing finishes.

                console.log(
                    `[${guild.name}] 🎁 Successfully ended and removed giveaway ${messageId}. Winners: ${pickedWinners.length}`,
                );
            }
        } catch (error) {
            console.error(
                `Error processing giveaways for guild ${guildId} (${guild.name}):`,
                error,
            );
        }
    }
}

// --- 2. CLIENT CONFIGURATION (UNCHANGED) ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
    ],
});

// Command Collection
client.commands = new Collection();
const commandsPayload = [];

// --- 3. DYNAMIC COMMAND LOADER (UNCHANGED) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const foldersPath = path.join(__dirname, "commands");

async function loadCommands() {
    if (!fs.existsSync(foldersPath)) {
        fs.mkdirSync(foldersPath);
        console.log("📂 Created 'commands' directory.");
        return 0;
    }

    const commandFolders = fs.readdirSync(foldersPath);
    let totalCommands = 0;
    
    for (const folder of commandFolders) {
        const commandsPath = path.join(foldersPath, folder);
        if (!fs.lstatSync(commandsPath).isDirectory()) continue;

        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
            
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            try {
                const commandPath = path.resolve(filePath).replace(/\\/g, '/');
                const commandModule = await import(`file://${commandPath}`);
                const command = commandModule.default;

                if (command?.data?.name && command?.execute) {
                    command.category = folder;
                    client.commands.set(command.data.name, command);
                    const commandData = command.data.toJSON();
                    commandsPayload.push(commandData);
                    
                    // Count subcommands if they exist
                    let subcommandCount = 0;
                    if (commandData.options) {
                        subcommandCount = commandData.options.filter(opt => opt.type === 1 || opt.type === 2).length;
                        if (subcommandCount > 0) {
                            console.log(`✅ /${command.data.name} (${subcommandCount} subcommands)`);
                        } else {
                            console.log(`✅ /${command.data.name}`);
                        }
                    } else {
                        console.log(`✅ /${command.data.name}`);
                    }
                    
                    totalCommands += 1 + subcommandCount; // Count the main command plus any subcommands
                }
            } catch (err) {
                console.error(`❌ Failed to load ${file}:`, err.message);
            }
        }
    }
    
    return totalCommands;
}

// --- 4. EVENT HANDLING ---
client.once("clientReady", async () => {
    console.log("🔄 Initializing Database...");

    // Initialize Replit DB and attach db instance to client
    const { db } = initializeDatabase();

    // Attach DB to client so commands can access it via interaction.client.db
    client.db = db;
    // Attach the utility function to the client for easy access in handlers
    client.getGuildConfig = getGuildConfig;

    if (client.db) {
        console.log("✅ Database initialized and attached to Client.");
    } else {
        console.error(
            "❌ Database failed to initialize. Database commands will fail.",
        );
    }
    
    // Set bot status from config
    if (BotConfig.bot?.status) {
        const { type, text } = BotConfig.bot.status;
        const activityType = getActivityType(type);
        
        client.user.setPresence({
            activities: [{
                name: text,
                type: activityType
            }],
            status: BotConfig.bot.presence || 'online'
        });
        
        console.log(`✅ Bot status set to: ${type} ${text}`);
    }

    try {
        // Initialize server counters
        console.log("🔄 Initializing server counters...");
        for (const [guildId, guild] of client.guilds.cache) {
            try {
                const counters = await getServerCounters(client, guildId);
                for (const counter of counters) {
                    await updateCounter(client, guild, counter);
                }
            } catch (error) {
                console.error(
                    `Error initializing counters for guild ${guildId}:`,
                    error,
                );
            }
        }

        // Load and register commands
        console.log("🔍 Loading commands...");
        const loadedCommands = await loadCommands();
        
        if (loadedCommands === 0) {
            console.error("❌ No commands were loaded. Check commands directory structure.");
        } else {
            try {
                await rest.put(Routes.applicationCommands(client.user.id), {
                    body: commandsPayload,
                });
                console.log(`\n✅ Successfully registered ${loadedCommands} commands`);
            } catch (error) {
                console.error("❌ Failed to register commands:", error.message);
            }
        }
    } catch (error) {
        console.error("❌ Error during initialization:", error);
    }

    // --- BIRTHDAY SYSTEM SCHEDULER START ---
    cron.schedule(
        "5 0 * * *",
        () => {
            checkBirthdays(client);
        },
        {
            scheduled: true,
            timezone: "UTC",
        },
    );
    console.log("⏰ Birthday check scheduled for 00:05 UTC daily.");
    // --- BIRTHDAY SYSTEM SCHEDULER END ---

    // --- GIVEAWAY SYSTEM SCHEDULER START ---
    // Schedule the check to run every minute
    // Run every 15 seconds for more precise giveaway endings
    cron.schedule(
        "*/15 * * * * *",
        () => {
            checkGiveaways(client);
        },
        {
            scheduled: true,
            timezone: "UTC",
        },
    );
    console.log("⏱️  Giveaway check scheduled for every minute UTC.");
    // --- GIVEAWAY SYSTEM SCHEDULER END ---

    console.log("✅ Bot is ready!");
});

client.on("interactionCreate", async (interaction) => {
    // Handle shared todo list buttons
    if (interaction.isButton() && interaction.customId.startsWith('shared_todo_')) {
        await interaction.deferUpdate();
        const [action, listId] = interaction.customId.split('_').slice(2);
        const userId = interaction.user.id;
        
        // Get the shared list
        const listData = await client.db.get(`shared_todo_${listId}`);
        if (!listData) {
            return interaction.followUp({
                embeds: [errorEmbed("Error", "Shared list not found or you don't have access.")],
                ephemeral: true
            });
        }
        
        // Check if user is a member
        if (!listData.members.includes(userId)) {
            return interaction.followUp({
                embeds: [errorEmbed("Error", "You don't have permission to modify this list.")],
                ephemeral: true
            });
        }
        
        if (action === 'add') {
            // Show modal to add a new task
            const modal = new ModalBuilder()
                .setCustomId(`shared_todo_modal_${listId}`)
                .setTitle(`Add Task to ${listData.name}`);
                
            const taskInput = new TextInputBuilder()
                .setCustomId('task_input')
                .setLabel('Task Description')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);
                
            const firstActionRow = new ActionRowBuilder().addComponents(taskInput);
            modal.addComponents(firstActionRow);
            
            return interaction.showModal(modal);
        } 
        else if (action === 'complete') {
            // Show a select menu of incomplete tasks
            const incompleteTasks = listData.tasks.filter(t => !t.completed);
            
            if (incompleteTasks.length === 0) {
                return interaction.followUp({
                    content: "No incomplete tasks to complete!",
                    ephemeral: true
                });
            }
            
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`shared_todo_complete_${listId}`)
                .setPlaceholder('Select a task to mark as complete')
                .addOptions(
                    incompleteTasks.map(task => ({
                        label: task.text.length > 90 ? task.text.substring(0, 87) + '...' : task.text,
                        value: task.id.toString(),
                        description: `Added on ${new Date(task.createdAt).toLocaleDateString()}`
                    }))
                );
                
            const row = new ActionRowBuilder().addComponents(selectMenu);
            
            return interaction.followUp({
                content: 'Select a task to mark as complete:',
                components: [row],
                ephemeral: true
            });
        }
    }
    
    // Handle shared todo modals
    if (interaction.isModalSubmit() && interaction.customId.startsWith('shared_todo_modal_')) {
        await interaction.deferUpdate();
        const listId = interaction.customId.split('_').pop();
        const taskText = interaction.fields.getTextInputValue('task_input');
        
        const listData = await client.db.get(`shared_todo_${listId}`);
        if (!listData) return;
        
        const newTask = {
            id: listData.nextId++,
            text: taskText,
            completed: false,
            createdAt: new Date().toISOString(),
            createdBy: interaction.user.id
        };
        
        listData.tasks.push(newTask);
        await client.db.set(`shared_todo_${listId}`, listData);
        
        // Update the message with the new task
        const taskList = listData.tasks
            .map(task => 
                `${task.completed ? '✅' : '📝'} ${task.id}. ${task.text} ` +
                `\`[${new Date(task.createdAt).toLocaleDateString()}` +
                (task.completed ? ` • Completed by ${task.completedBy}` : '') + '`'
            )
            .join('\n');
            
        return interaction.editReply({
            embeds: [
                successEmbed(
                    `Shared List: ${listData.name}`, 
                    taskList
                )
            ]
        });
    }
    
    // Handle shared todo select menus
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('shared_todo_complete_')) {
        await interaction.deferUpdate();
        const listId = interaction.customId.split('_').pop();
        const taskId = parseInt(interaction.values[0]);
        
        const listData = await client.db.get(`shared_todo_${listId}`);
        if (!listData) return;
        
        const task = listData.tasks.find(t => t.id === taskId);
        if (task) {
            task.completed = true;
            task.completedBy = interaction.user.username;
            task.completedAt = new Date().toISOString();
            
            await client.db.set(`shared_todo_${listId}`, listData);
            
            // Update the message
            const taskList = listData.tasks
                .map(t => 
                    `${t.completed ? '✅' : '📝'} ${t.id}. ${t.text} ` +
                    `\`[${new Date(t.createdAt).toLocaleDateString()}` +
                    (t.completed ? ` • Completed by ${t.completedBy}` : '') + '`'
                )
                .join('\n');
                
            return interaction.editReply({
                embeds: [
                    successEmbed(
                        `Shared List: ${listData.name}`, 
                        taskList
                    )
                ]
            });
        }
    }
    
    // Handle reaction roles first
    if (await handleReactionRoles(interaction)) return;

    // Determine the configuration object for the guild
    const guildId = interaction.guildId;
    let guildConfig = {};
    if (client.db && guildId) {
        guildConfig = await getGuildConfig(client, guildId);
    }

    // Slash Command Handling
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        // --- COMMAND TOGGLE CHECK ---
        const disabledCommands = guildConfig.enabledCommands || {};

        // Check if the command is explicitly disabled (false)
        if (disabledCommands[command.data.name] === false) {
            const isManager = interaction.member.permissions.has(
                PermissionFlagsBits.ManageGuild,
            );

            if (!isManager) {
                // If the user is NOT a manager, block the command execution
                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "Command Disabled",
                            `The command **\`/${command.data.name}\`** has been disabled by a server administrator.`,
                        ),
                    ],
                    ephemeral: true,
                });
            }
            console.log(
                `Bypassing block for ${command.data.name} because user is a manager.`,
            );
        }
        // ----------------------------------

        try {
            // Pass the loaded guildConfig to the command's execute function
            await command.execute(interaction, guildConfig, client);
        } catch (error) {
            console.error(error);
            const errResponse = {
                embeds: [
                    errorEmbed(
                        "An error occurred while executing this command.",
                    ),
                ],
                ephemeral: true,
            };
            if (interaction.replied || interaction.deferred)
                await interaction.followUp(errResponse);
            else await interaction.reply(errResponse);
        }
    }

    // --- 2. GIVEAWAY ENTER LOGIC (FIXED) ---
    if (interaction.customId === "enter_giveaway") {
        await interaction.deferReply({ ephemeral: true });

        const giveawayDbKey = giveawayKey(interaction.guildId);
        const messageId = interaction.message.id;
        const userId = interaction.user.id;

        try {
            // 1. Fetch all giveaways and the specific giveaway data
            const allGiveawaysResult = await client.db.get(giveawayDbKey);
            const allGiveaways =
                allGiveawaysResult &&
                typeof allGiveawaysResult === "object" &&
                "value" in allGiveawaysResult
                    ? allGiveawaysResult.value
                    : allGiveawaysResult || {};

            const giveawayData = allGiveaways[messageId];

            if (!giveawayData) {
                console.error(
                    `[Giveaway] No giveaway data found for message ID: ${messageId}`,
                );
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Giveaway Error",
                            "This giveaway is no longer active or data was not found.",
                        ),
                    ],
                });
            }

            // 2. Check if already participating
            if (giveawayData.participants.includes(userId)) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Already Entered",
                            "You have already entered this giveaway.",
                        ),
                    ],
                });
            }

            // 3. Add participant
            if (!Array.isArray(giveawayData.participants)) {
                giveawayData.participants = [];
            }
            giveawayData.participants.push(userId);

            // 4. Update the database
            allGiveaways[messageId] = giveawayData;
            await client.db.set(giveawayDbKey, allGiveaways);

            // 5. Update the giveaway message with new entry count
            try {
                // Create a new embed with updated entry count
                const updatedEmbed = new EmbedBuilder(
                    interaction.message.embeds[0],
                );

                // Find and update the Entries field in the embed
                const entriesFieldIndex = updatedEmbed.data.fields?.findIndex(
                    (f) => f.name === "Entries",
                );
                if (
                    entriesFieldIndex !== undefined &&
                    entriesFieldIndex !== -1
                ) {
                    updatedEmbed.data.fields[entriesFieldIndex].value =
                        `${giveawayData.participants.length}`;
                }

                // Update the message with the updated embed
                await interaction.message.edit({
                    embeds: [updatedEmbed],
                });
            } catch (e) {
                console.error(
                    "Failed to update giveaway message entry count:",
                    e,
                );
                // Continue execution even if message update fails
            }

            // 6. Send confirmation
            return interaction.editReply({
                embeds: [
                    successEmbed(
                        "Entered!",
                        `You have successfully entered the giveaway for **${giveawayData.prize}**! Good luck!`,
                    ),
                ],
            });
        } catch (error) {
            console.error("Error in giveaway entry handling:", error);
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Error",
                        "An error occurred while processing your entry. Please try again later.",
                    ),
                ],
            });
        }
    }

    // Global Button Handler
    if (interaction.isButton()) {
        // Handle countdown interactions first
        if (interaction.customId.startsWith('countdown_')) {
            return handleCountdownInteraction(interaction);
        }
        
        // --- 1. CREATE TICKET LOGIC (Handles the button from /ticket setup) ---
        if (interaction.customId === "create_ticket") {
            await interaction.deferReply({ ephemeral: true });

            // Check for existing open ticket for this user (using the raw User ID in the topic)
            const existingTicket = interaction.guild.channels.cache.find(
                (c) =>
                    c.topic === interaction.user.id &&
                    c.name.startsWith("ticket-") &&
                    c.type === ChannelType.GuildText,
            );

            if (existingTicket) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Ticket Already Open",
                            `You already have an open ticket: ${existingTicket}`,
                        ),
                    ],
                    ephemeral: true,
                });
            }

            // Get Category ID from config
            const preferredCategoryId = guildConfig.ticketCategoryId;

            // Generate a random 4-digit number (0000 to 9999)
            const randomNumber = Math.floor(Math.random() * 10000);

            // Ensure the number is a 4-digit string, padded with leading zeros
            const randomId = String(randomNumber).padStart(4, "0");

            // Construct the channel name: ticket-FOUR_DIGIT_NUMBER
            const channelName = `ticket-${randomId}`;

            try {
                let category = null;

                if (preferredCategoryId) {
                    category =
                        interaction.guild.channels.cache.get(
                            preferredCategoryId,
                        );
                }

                // If configured category doesn't exist, try to find a default 'Tickets' category
                if (!category) {
                    category = interaction.guild.channels.cache.find(
                        (c) =>
                            c.name.toLowerCase() === "tickets" &&
                            c.type === ChannelType.GuildCategory,
                    );
                }

                // If still no category, create a new one
                if (!category) {
                    category = await interaction.guild.channels.create({
                        name: "Tickets",
                        type: ChannelType.GuildCategory,
                        permissionOverwrites: [
                            {
                                id: interaction.guild.id, // @everyone role
                                deny: [PermissionFlagsBits.ViewChannel],
                            },
                            {
                                id: client.user.id, // Bot itself
                                allow: [PermissionFlagsBits.ViewChannel],
                            },
                        ],
                    });
                }

                // Create the ticket channel
                const permissionOverwrites = [
                    {
                        id: interaction.guild.id, // @everyone role
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: interaction.user.id, // Ticket opener
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                        ],
                    },
                    // NOTE: Staff access is typically granted by having Administrator/ManageChannels
                    // or by adding an explicit Staff Role ID here if one is configured.
                    // If you have a Staff Role ID in guildConfig, you should add it here.
                ];

                // Add the bot's permission explicitly for safety
                permissionOverwrites.push({
                    id: client.user.id,
                    allow: [PermissionFlagsBits.ViewChannel],
                });

                const ticketChannel = await interaction.guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: category.id,
                    // *** FIX APPLIED HERE: Using only the raw User ID for the topic ***
                    topic: interaction.user.id,
                    permissionOverwrites: permissionOverwrites,
                });

                // --- NEW TICKET WELCOME MESSAGE AND BUTTONS (Unclaimed State) ---
                const welcomeEmbed = createEmbed(
                    "📝 New Support Ticket Opened",
                    `${interaction.user}, welcome! Please describe your issue here. 
                    \n**Moderators:** Click the button below to claim this ticket and assist the user.`,
                )
                    .setColor("#9B59B6")
                    .setFooter({
                        text: `Opened by ${interaction.user.tag} | ID: ${interaction.user.id}`,
                    });

                const actionRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("claim_ticket")
                        .setLabel("Claim Ticket")
                        .setStyle(ButtonStyle.Success)
                        .setEmoji("🙋"),
                    new ButtonBuilder()
                        .setCustomId("close_ticket")
                        .setLabel("Close Ticket")
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji("🔒"),
                );

                await ticketChannel.send({
                    embeds: [welcomeEmbed],
                    components: [actionRow],
                });

                await interaction.editReply({
                    embeds: [
                        successEmbed(
                            "Ticket Created",
                            `Your ticket has been created: ${ticketChannel}`,
                        ),
                    ],
                    ephemeral: true,
                });
            } catch (error) {
                console.error("Error creating ticket:", error);
                await interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Error",
                            "Failed to create ticket. Please try again later.",
                        ),
                    ],
                    ephemeral: true,
                });
            }
        } else {
            // --- 2. COMMAND-LINKED BUTTON LOGIC (Close, Claim, Unclaim) ---
            const commandButtonMap = {
                close_ticket: "close",
                claim_ticket: "claim",
            };

            const commandName = commandButtonMap[interaction.customId];

            if (commandName) {
                const command = client.commands.get(commandName);

                if (command) {
                    try {
                        // Check for a dedicated button handler method on the command object first
                        if (command.handleButton) {
                            await command.handleButton(client, interaction);
                        } else {
                            // Fallback: Execute the main slash command logic
                            await command.execute(
                                interaction,
                                guildConfig,
                                client,
                            );
                        }
                    } catch (error) {
                        console.error(
                            `Error executing button for command ${commandName}:`,
                            error,
                        );
                        // Fallback error handling
                        const errResponse = {
                            embeds: [
                                errorEmbed(
                                    "Interaction Error",
                                    `Failed to process the request for the **${commandName}** command button.`,
                                ),
                            ],
                            ephemeral: true,
                        };

                        // Check if the interaction has been replied to or deferred before sending followUp/reply
                        if (interaction.deferred || interaction.replied) {
                            await interaction.followUp(errResponse);
                        } else {
                            await interaction.reply(errResponse);
                        }
                    }
                } else {
                    return interaction.reply({
                        embeds: [
                            errorEmbed(
                                "Configuration Error",
                                `The \`/${commandName}\` command is not loaded. Check command file name.`,
                            ),
                        ],
                        ephemeral: true,
                    });
                }
            }
        }
    }
});

// Add member join/leave handlers after the clientReady event
client.on("guildMemberAdd", async (member) => {
    if (!member.guild) return;
    
    // Run the welcome system handler
    try {
        await handleGuildMemberAdd.execute(member);
    } catch (error) {
        console.error('Error in welcome system (guildMemberAdd):', error);
    }
    
    // Log the member join
    const guildConfig = await getGuildConfig(client, member.guild.id);
    if (guildConfig?.logChannelId) {
        const logChannel = member.guild.channels.cache.get(guildConfig.logChannelId);
        if (logChannel) {
            const embed = new EmbedBuilder()
                .setColor("#43b581")
                .setTitle("👋 New Member")
                .setThumbnail(member.user.displayAvatarURL())
                .addFields(
                    {
                        name: "User",
                        value: `${member.user.tag} (${member.user.id})`,
                        inline: true,
                    },
                    {
                        name: "Account Age",
                        value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
                        inline: true,
                    },
                    {
                        name: "Server Member Count",
                        value: member.guild.memberCount.toString(),
                        inline: true,
                    }
                )
                .setFooter({ text: `User ID: ${member.user.id}` })
                .setTimestamp();

            try {
                await logChannel.send({ embeds: [embed] });
            } catch (error) {
                console.error("Failed to send join log:", error);
            }
        }
    }

    // Update counters for member join
    try {
        const counters = await getServerCounters(client, member.guild.id);
        for (const counter of counters) {
            if (
                counter.type === "members" ||
                (counter.type === "members_only" && !member.user.bot) ||
                (counter.type === "bots" && member.user.bot)
            ) {
                await updateCounter(client, member.guild, counter);
            }
        }
    } catch (error) {
        console.error("Error updating counters on member join:", error);
    }
});

client.on("guildMemberRemove", async (member) => {
    if (!member.guild) return;

    // Run the goodbye system handler
    try {
        await handleGuildMemberRemove.execute(member);
    } catch (error) {
        console.error('Error in welcome system (guildMemberRemove):', error);
    }

    // Update counters for member leave
    try {
        const counters = await getServerCounters(client, member.guild.id);
        for (const counter of counters) {
            if (
                counter.type === "members" ||
                (counter.type === "members_only" && !member.user.bot) ||
                (counter.type === "bots" && member.user.bot)
            ) {
                await updateCounter(client, member.guild, counter);
            }
        }
    } catch (error) {
        console.error("Error updating counters on member leave:", error);
    }

    // Existing leave logging code
    const guildConfig = await getGuildConfig(client, member.guild.id);
    if (guildConfig?.logChannelId) {
        const logChannel = member.guild.channels.cache.get(
            guildConfig.logChannelId,
        );
        if (logChannel) {
            const embed = new EmbedBuilder()
                .setColor("#f04747")
                .setTitle("👋 Member Left")
                .setThumbnail(member.user.displayAvatarURL())
                .addFields(
                    {
                        name: "User",
                        value: `${member.user.tag} (${member.id})`,
                        inline: true,
                    },
                    {
                        name: "Account Age",
                        value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
                        inline: true,
                    },
                    {
                        name: "Server Member Count",
                        value: member.guild.memberCount.toString(),
                        inline: true,
                    },
                )
                .setFooter({ text: `User ID: ${member.id}` })
                .setTimestamp();

            try {
                await logChannel.send({ embeds: [embed] });
            } catch (error) {
                console.error("Failed to send leave log:", error);
            }
        }
    }
});

// Add a scheduled task to update counters periodically (every 15 minutes)
cron.schedule("*/15 * * * *", async () => {
    console.log("🔄 Running scheduled counter update...");
    for (const [guildId, guild] of client.guilds.cache) {
        try {
            const counters = await getServerCounters(client, guildId);
            for (const counter of counters) {
                await updateCounter(client, guild, counter);
            }
        } catch (error) {
            console.error(
                `Error in scheduled counter update for guild ${guildId}:`,
                error,
            );
        }
    }
});

// 3. Message Deleted
client.on("messageDelete", async (message) => {
    if (message.author?.bot || !message.guild) return;

    const guildConfig = await getGuildConfig(client, message.guild.id);
    if (guildConfig?.logChannelId) {
        const logChannel = message.guild.channels.cache.get(
            guildConfig.logChannelId,
        );
        if (logChannel) {
            const embed = new EmbedBuilder()
                .setColor("#ff0000")
                .setTitle("🗑️ Message Deleted")
                .setDescription(
                    `A message by ${message.author} was deleted in ${message.channel}.`,
                )
                .addFields(
                    {
                        name: "Channel",
                        value: message.channel.toString(),
                        inline: true,
                    },
                    {
                        name: "Message Content",
                        value: message.content
                            ? `\`\`\`${message.content.substring(0, 1000)}\`\`\``
                            : "*[No content]*",
                    },
                )
                .setFooter({
                    text: `User ID: ${message.author.id} • Message ID: ${message.id}`,
                })
                .setTimestamp();

            try {
                await logChannel.send({ embeds: [embed] });
            } catch (error) {
                console.error("Failed to send message delete log:", error);
            }
        }
    }
});

// 4. Message Edited
// Handle message creation for XP gain
client.on("messageCreate", async (message) => {
    // Ignore bots and DMs
    if (message.author.bot || !message.guild) return;

    try {
        const levelingConfig = await getLevelingConfig(
            client,
            message.guild.id,
        );

        // Check if leveling is enabled
        if (!levelingConfig?.enabled) return;

        // Check if the message is in an ignored channel
        if (levelingConfig.ignoredChannels?.includes(message.channel.id))
            return;

        // Check if the user has a blacklisted role
        const member = await message.guild.members
            .fetch(message.author.id)
            .catch(() => null);
        if (!member) return;

        const hasBlacklistedRole = member.roles.cache.some((role) =>
            levelingConfig.blacklistedRoles?.includes(role.id),
        );

        if (hasBlacklistedRole) return;

        // Get user data and check cooldown
        const userData = await getUserLevelData(
            client,
            message.guild.id,
            message.author.id,
        );
        const now = Date.now();
        const cooldown = (levelingConfig.xpCooldown || 60) * 1000; // Default to 60 seconds

        if (now - userData.lastMessage < cooldown) return;

        // Calculate random XP within range
        const min = levelingConfig.xpRange?.min || 15;
        const max = levelingConfig.xpRange?.max || 25;
        const xpToAdd = Math.floor(Math.random() * (max - min + 1)) + min;

        // Add XP and check for level up
        const levelUp = await addXp(client, message.guild, member, xpToAdd);

        // Update last message time
        userData.lastMessage = now;
        await saveUserLevelData(
            client,
            message.guild.id,
            message.author.id,
            userData,
        );

        // Handle level up notification
        if (levelUp) {
            const { newLevel, config } = levelUp;

            // Send level up message
            let levelUpChannel = message.channel;
            if (config.levelUpChannel) {
                levelUpChannel =
                    (await message.guild.channels
                        .fetch(config.levelUpChannel)
                        .catch(() => null)) || message.channel;
            }

            const levelUpMessage = (
                config.levelUpMessage || "🎉 {user} has reached level {level}!"
            )
                .replace(/{user}/g, `<@${message.author.id}>`)
                .replace(/{level}/g, newLevel);

            await levelUpChannel.send(levelUpMessage).catch(console.error);
        }
    } catch (error) {
        console.error("Error in messageCreate event (leveling):", error);
    }
});

// Handle message updates (ignore if content didn't change)
client.on("messageUpdate", async (oldMessage, newMessage) => {
    if (oldMessage.author?.bot || !oldMessage.guild) return;
    if (oldMessage.content === newMessage.content) return;

    const guildConfig = await getGuildConfig(client, oldMessage.guild.id);
    if (guildConfig?.logChannelId) {
        const logChannel = oldMessage.guild.channels.cache.get(
            guildConfig.logChannelId,
        );
        if (logChannel) {
            const embed = new EmbedBuilder()
                .setColor("#8A2BE2")
                .setTitle("📝 Message Edited")
                .setDescription(
                    `A message by ${oldMessage.author} was edited in ${oldMessage.channel}. [Jump to Message](${newMessage.url})`,
                )
                .addFields(
                    {
                        name: "Channel",
                        value: oldMessage.channel.toString(),
                        inline: true,
                    },
                    {
                        name: "Original Content",
                        value: oldMessage.content
                            ? `\`\`\`${oldMessage.content.substring(0, 1000)}\`\`\``
                            : "*[Content not cached]*",
                    },
                    {
                        name: "New Content",
                        value: newMessage.content
                            ? `\`\`\`${newMessage.content.substring(0, 1000)}\`\`\``
                            : "*[Content not cached]*",
                    },
                )
                .setFooter({
                    text: `User ID: ${oldMessage.author.id} • Message ID: ${oldMessage.id}`,
                })
                .setTimestamp();

            try {
                await logChannel.send({ embeds: [embed] });
            } catch (error) {
                console.error("Failed to send message edit log:", error);
            }
        }
    }
});

// --- 5. INITIALIZATION ---
// GLOBAL ERROR HANDLING
process.on('unhandledRejection', (reason, promise) => {
    console.error(' [ERROR] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error(' [ERROR] Uncaught Exception:', error);
});

if (!process.env.TOKEN) {
    console.log("⚠️ WARNING: 'TOKEN' secret is missing.");
} else {
    // Initialize REST client
    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

    // Login the client
    client
        .login(process.env.TOKEN)
        .then(() => console.log("✅ Bot is logged in and ready!"))
        .catch((error) => {
            console.error("❌ Failed to log in:", error);
            process.exit(1);
        });
}

// ... (rest of the code remains the same)
