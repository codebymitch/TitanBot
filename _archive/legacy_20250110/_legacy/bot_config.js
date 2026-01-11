/**
 * Main configuration object for Titan Bot
 * All bot-wide settings should be defined here for easy customization
 * @typedef {Object} BotConfig
 * @property {Object} bot - Bot presence and status settings
 * @property {Object} bot.status - Bot status configuration
 * @property {string} bot.status.type - Type of activity ('Playing', 'Streaming', 'Listening', 'Watching', 'Competing')
 * @property {string} bot.status.text - Text to display in the status
 * @property {string} bot.presence - Bot's online status ('online', 'idle', 'dnd', 'invisible')
 * @property {string} bot.defaultPrefix - Default command prefix
 * @property {string[]} bot.owners - Array of bot owner user IDs
 * @property {?string} bot.supportGuildId - ID of the support server (or null if none)
 * @property {Object} applications - Application system configuration
 * @property {Object[]} applications.defaultQuestions - Default application questions
 * @property {Object} applications.statusColors - Application status colors
 * @property {string} applications.statusColors.pending - Color for pending applications
 * @property {string} applications.statusColors.approved - Color for approved applications
 * @property {string} applications.statusColors.denied - Color for denied applications
 * @property {number} applications.applicationCooldown - Cooldown between applications (in hours)
 * @property {number} applications.deleteDeniedAfter - Delete denied applications after (in days, 0 to keep forever)
 * @property {number} applications.deleteApprovedAfter - Delete approved applications after (in days, 0 to keep forever)
 * @property {string[]} applications.managerRoles - Roles that can manage applications
 * @property {Object} embeds - Embed styling and theming
 * @property {Object} embeds.colors - Color scheme for embeds
 * @property {string} embeds.colors.primary - Primary color for embeds
 * @property {string} embeds.colors.success - Color for success messages
 * @property {string} embeds.colors.error - Color for error messages
 * @property {string} embeds.colors.warning - Color for warning messages
 * @property {string} embeds.colors.info - Color for info messages
 * @property {Object} embeds.colors.giveaway - Colors for giveaway embeds
 * @property {string} embeds.colors.giveaway.active - Color for active giveaways
 * @property {string} embeds.colors.giveaway.ended - Color for ended giveaways
 * @property {Object} embeds.colors.ticket - Colors for ticket embeds
 * @property {string} embeds.colors.ticket.open - Color for open tickets
 * @property {string} embeds.colors.ticket.closed - Color for closed tickets
 * @property {string} embeds.colors.economy - Color for economy-related embeds
 * @property {string} embeds.colors.birthday - Color for birthday-related embeds
 * @property {string} embeds.colors.moderation - Color for moderation actions
 * @property {Object} embeds.footer - Default footer for embeds
 * @property {string} embeds.footer.text - Footer text
 * @property {?string} embeds.footer.icon - Footer icon URL (or null)
 * @property {?string} embeds.thumbnail - Default thumbnail URL for embeds (or null)
 * @property {Object} embeds.author - Default author for embeds
 * @property {?string} embeds.author.name - Author name (or null)
 * @property {?string} embeds.author.icon - Author icon URL (or null)
 * @property {?string} embeds.author.url - Author URL (or null)
 * @property {Object} economy - Economy system settings
 * @property {Object} economy.currency - Currency configuration
 * @property {string} economy.currency.name - Singular name of the currency
 * @property {string} economy.currency.namePlural - Plural name of the currency
 * @property {string} economy.currency.symbol - Currency symbol
 * @property {number} economy.startingBalance - Starting balance for new users
 * @property {number} economy.baseBankCapacity - Base bank capacity for users
 * @property {number} economy.dailyAmount - Amount given for daily command
 * @property {number} economy.workMin - Minimum work reward
 * @property {number} economy.workMax - Maximum work reward
 * @property {number} economy.begMin - Minimum beg reward
 * @property {number} economy.begMax - Maximum beg reward
 * @property {number} economy.robSuccessRate - Chance of successful robbery (0-1)
 * @property {number} economy.robFailJailTime - Jail time in ms for failed robbery
 * @property {Object} tickets - Ticket system settings
 * @property {?string} tickets.defaultCategory - Default category ID for ticket channels (or null)
 * @property {string[]} tickets.supportRoles - Array of role IDs that can manage tickets
 * @property {Object} tickets.priorities - Priority levels for tickets
 * @property {Object} tickets.priorities.none - No priority settings
 * @property {string} tickets.priorities.none.emoji - Emoji for no priority
 * @property {string} tickets.priorities.none.color - Color for no priority
 * @property {string} tickets.priorities.none.label - Label for no priority
 * @property {Object} tickets.priorities.low - Low priority settings
 * @property {string} tickets.priorities.low.emoji - Emoji for low priority
 * @property {string} tickets.priorities.low.color - Color for low priority
 * @property {string} tickets.priorities.low.label - Label for low priority
 * @property {Object} tickets.priorities.medium - Medium priority settings
 * @property {string} tickets.priorities.medium.emoji - Emoji for medium priority
 * @property {string} tickets.priorities.medium.color - Color for medium priority
 * @property {string} tickets.priorities.medium.label - Label for medium priority
 * @property {Object} tickets.priorities.high - High priority settings
 * @property {string} tickets.priorities.high.emoji - Emoji for high priority
 * @property {string} tickets.priorities.high.color - Color for high priority
 * @property {string} tickets.priorities.high.label - Label for high priority
 * @property {Object} tickets.priorities.urgent - Urgent priority settings
 * @property {string} tickets.priorities.urgent.emoji - Emoji for urgent priority
 * @property {string} tickets.priorities.urgent.color - Color for urgent priority
 * @property {string} tickets.priorities.urgent.label - Label for urgent priority
 * @property {string} tickets.defaultPriority - Default priority level
 * @property {?string} tickets.archiveCategory - Category ID to move closed tickets to (or null)
 * @property {?string} tickets.logChannel - Channel ID to log ticket actions (or null)
 * @property {Object} giveaways - Giveaway system settings
 * @property {number} giveaways.defaultDuration - Default duration in ms (24 hours)
 * @property {number} giveaways.minimumWinners - Minimum number of winners (1)
 * @property {number} giveaways.maximumWinners - Maximum number of winners (10)
 * @property {number} giveaways.minimumDuration - Minimum duration in ms (5 minutes)
 * @property {number} giveaways.maximumDuration - Maximum duration in ms (30 days)
 * @property {string[]} giveaways.allowedRoles - Roles that can create giveaways (empty = any admin)
 * @property {string[]} giveaways.bypassRoles - Roles that bypass cooldowns and limits
 * @property {Object} birthday - Birthday system settings
 * @property {?string} birthday.defaultRole - Default birthday role ID (or null)
 * @property {?string} birthday.announcementChannel - Channel ID for birthday announcements (or null)
 * @property {string} birthday.timezone - Default timezone for birthday checks ('UTC')
 * @property {Object} cooldowns - Default cooldowns in ms
 * @property {number} cooldowns.default - Default cooldown (3 seconds)
 * @property {Object} cooldowns.economy - Economy command cooldowns
 * @property {number} cooldowns.economy.work - Work command cooldown (1 hour)
 * @property {number} cooldowns.economy.daily - Daily command cooldown (24 hours)
 * @property {number} cooldowns.economy.beg - Beg command cooldown (5 minutes)
 * @property {number} cooldowns.economy.rob - Rob command cooldown (1 hour)
 * @property {number} cooldowns.economy.crime - Crime command cooldown (1 hour)
 * @property {Object} cooldowns.utility - Utility command cooldowns
 * @property {Object} messages - System messages and responses
 * @property {string} messages.noPermission - No permission message
 * @property {string} messages.cooldownActive - Cooldown active message
 * @property {string} messages.errorOccurred - Error occurred message
 * @property {string} messages.missingPermissions - Missing permissions message
 * @property {string} messages.commandDisabled - Command disabled message
 * @property {string} messages.maintenanceMode - Maintenance mode message
 * @property {Object} branding - Branding and links
 * @property {string} branding.name - Bot name
 * @property {?string} branding.iconURL - Bot icon URL (or null)
 * @property {string} branding.supportServer - Support server invite URL
 * @property {?string} branding.inviteLink - Bot invite URL (or null)
 * @property {?string} branding.website - Bot website URL (or null)
 * @property {?string} branding.github - GitHub repository URL (or null)
 * @property {Object} features - Feature toggles
 * @property {boolean} features.music - Music system enabled
 * @property {boolean} features.economy - Economy system enabled
 * @property {boolean} features.tickets - Ticket system enabled
 * @property {boolean} features.giveaways - Giveaway system enabled
 * @property {boolean} features.birthday - Birthday system enabled
 * @property {boolean} features.moderation - Moderation commands enabled
 * @property {boolean} features.logging - Logging system enabled
 * @property {Object} api - API keys and sensitive data (use environment variables in production)
 * @property {Object} counters - Counter system settings
 * @property {Object} counters.defaults - Default counter settings
 * @property {string} counters.defaults.name - Default counter name format
 * @property {Object} counters.permissions - Default permissions for counter channels
 * @property {string[]} counters.permissions.deny - Permissions to deny for everyone
 * @property {string[]} counters.permissions.allow - Permissions to allow for the bot
 * @property {Object} counters.messages - Counter system messages
 * @property {string} counters.messages.counterCreated - Message when a counter is created
 * @property {string} counters.messages.counterDeleted - Message when a counter is deleted
 * @property {string} counters.messages.counterNotFound - Message when counter is not found
 * @property {string} counters.messages.missingManageChannels - Missing manage channels permission message
 */

export const BotConfig = {
    // Bot presence and status settings
    bot: {
        status: {
            type: "Playing",  // Can be: Playing, Streaming, Listening, Watching, Competing
            text: "/help | Titan Bot",
        },
        presence: "online",  // online, idle, dnd, invisible
        defaultPrefix: "!",  // Default command prefix (if using message commands)
        owners: [],          // Array of bot owner user IDs
        supportGuildId: null, // ID of the support server
    },

    // Embed styling and theming
    embeds: {
        colors: {
            primary: "#336699",
            success: "#2ECC71",
            error: "#E74C3C",
            warning: "#F39C12",
            info: "#3498DB",
            giveaway: {
                active: "#2ECC71",
                ended: "#E74C3C",
            },
            ticket: {
                open: "#9B59B6",
                closed: "#E74C3C",
            },
            economy: "#FFD700",
            birthday: "#FF69B4",
            moderation: "#E74C3C",
        },
        footer: {
            text: "Built by Touchpoint Support",
            icon: null,
        },
        thumbnail: null,  // URL to default thumbnail
        author: {
            name: null,   // Default author name
            icon: null,   // Default author icon URL
            url: null,    // Default author URL
        },
    },

    // Economy system settings
    economy: {
        currency: {
            name: "coins",
            namePlural: "coins",
            symbol: "$",
        },
        startingBalance: 0,
        baseBankCapacity: 100000,
        dailyAmount: 100,  // Amount given for daily command
        workMin: 10,      // Minimum work reward
        workMax: 100,     // Maximum work reward
        begMin: 5,        // Minimum beg reward
        begMax: 50,       // Maximum beg reward
        robSuccessRate: 0.4,  // 40% chance to succeed
        robFailJailTime: 60 * 60 * 1000,  // 1 hour in milliseconds
    },

    // Ticket system settings
    tickets: {
        defaultCategory: null,  // Default category ID for ticket channels
        supportRoles: [],      // Array of role IDs that can manage tickets
        priorities: {
            none: { emoji: "⚪", color: "#95A5A6", label: "None" },
            low: { emoji: "🟢", color: "#2ECC71", label: "Low" },
            medium: { emoji: "🟡", color: "#F39C12", label: "Medium" },
            high: { emoji: "🟠", color: "#E67E22", label: "High" },
            urgent: { emoji: "🔴", color: "#E74C3C", label: "Urgent" },
        },
        defaultPriority: "medium",
        archiveCategory: null,  // Category to move closed tickets to
        logChannel: null,       // Channel to log ticket actions
    },

    // Giveaway system settings
    giveaways: {
        defaultDuration: 24 * 60 * 60 * 1000,  // 24 hours in milliseconds
        minimumWinners: 1,
        maximumWinners: 10,
        minimumDuration: 5 * 60 * 1000,  // 5 minutes
        maximumDuration: 30 * 24 * 60 * 60 * 1000,  // 30 days
        allowedRoles: [],  // Roles that can create giveaways (empty = any admin)
        bypassRoles: [],   // Roles that bypass cooldowns and limits
    },

    // Birthday system settings
    birthday: {
        defaultRole: null,     // Default birthday role ID
        announcementChannel: null,  // Channel for birthday announcements
        timezone: "UTC",      // Default timezone for birthday checks
    },

    // Cooldown settings (in milliseconds)
    cooldowns: {
        default: 3000,          // 3 seconds
        economy: {
            work: 3600000,      // 1 hour
            daily: 86400000,    // 24 hours
            beg: 300000,        // 5 minutes
            rob: 3600000,       // 1 hour
            crime: 3600000,     // 1 hour
        },
        utility: {
            // Add utility command cooldowns here
        },
    },

    // System messages and responses
    messages: {
        noPermission: "You don't have permission to use this command.",
        cooldownActive: "Please wait before using this command again.",
        errorOccurred: "An error occurred while executing this command.",
        missingPermissions: "You don't have the required permissions to use this command.",
        commandDisabled: "This command is currently disabled.",
        maintenanceMode: "The bot is currently in maintenance mode. Please try again later.",
    },

    // Branding and links
    branding: {
        name: "Titan Bot",
        iconURL: null,  // URL to bot's icon
        supportServer: "https://discord.gg/your-server",
        inviteLink: null,  // Bot invite URL
        website: null,     // Bot website
        github: null,      // GitHub repository
    },

    // Feature toggles
    // Welcome system settings
    welcome: {
        defaultWelcomeMessage: 'Welcome {user} to {server}! We now have {memberCount} members!',
        defaultGoodbyeMessage: '{user} has left the server. We now have {memberCount} members.',
        defaultWelcomeChannel: null, // Set to channel ID to enable by default
        defaultGoodbyeChannel: null, // Set to channel ID to enable by default
        defaultWelcomeImage: null, // URL to default welcome image
        defaultGoodbyeImage: null, // URL to default goodbye image
        defaultWelcomePing: false, // Whether to ping the user in welcome messages by default
        defaultAutoRoles: [], // Array of role IDs to assign by default
        enabled: true, // Whether the welcome system is enabled by default
    },

    features: {
        welcome: true, // Enable/disable welcome system
        economy: true,
        tickets: true,
        giveaways: true,
        birthday: true,
        applications: true,
        moderation: true,
        logging: true,
        counters: true, // Add counters to feature toggles
    },

    // API keys and sensitive data (consider using environment variables for these in production)
    api: {
        // Add any API keys here or use environment variables
        // Example: openai: process.env.OPENAI_API_KEY,
    },

    // Counter system settings
    counters: {
        // Default counter settings
        defaults: {
            name: "{type} Counter", // {type} will be replaced with the counter type
        },
        
        // Default permissions for counter channels
        permissions: {
            // These permissions will be denied for everyone
            deny: [
                'SendMessages',
                'SendMessagesInThreads',
                'Speak',
                'Connect',
                'Stream',
                'UseEmbeddedActivities'
            ],
            // These permissions will be allowed for the bot
            allow: [
                'ManageChannels',
                'ManageRoles',
                'ViewChannel',
                'ReadMessageHistory'
            ]
        },
        
        // Counter system messages
        messages: {
            counterCreated: 'Successfully created {type} counter in {channel}',
            counterDeleted: 'Successfully deleted counter {id}',
            counterNotFound: 'Could not find a counter with that ID. Use `/counterlist` to see all counters.',
            missingManageChannels: 'I need the "Manage Channels" permission to create counters.'
        },
        
        // Counter types configuration
        types: {
            members: {
                name: '👥 Members',
                description: 'Total server members',
                getCount: (guild) => guild.memberCount.toString()
            },
            bots: {
                name: '🤖 Bots',
                description: 'Total bot accounts in the server',
                getCount: (guild) => guild.members.cache.filter(member => member.user.bot).size.toString()
            },
            members_only: {
                name: '👤 Humans',
                description: 'Total human members (non-bots)',
                getCount: (guild) => guild.members.cache.filter(member => !member.user.bot).size.toString()
            }
        }
    },
};

/**
 * Activity types for the bot's presence
 * @readonly
 * @enum {number}
 */
export const ActivityTypes = {
    /** The bot is playing a game */
    Playing: 0,
    /** The bot is streaming */
    Streaming: 1,
    /** The bot is listening to something */
    Listening: 2,
    /** The bot is watching something */
    Watching: 3,
    /** The bot is competing in something */
    Competing: 5,
};

/**
 * Gets the activity type from a string name
 * @param {string} typeName - The name of the activity type (case-sensitive)
 * @returns {number} The activity type ID, or 0 (Playing) if not found
 */
export function getActivityType(typeName) {
    if (!typeName || typeof typeName !== 'string') {
        console.warn(`Invalid activity type: ${typeName}, defaulting to Playing`);
        return ActivityTypes.Playing;
    }
    return ActivityTypes[typeName] ?? ActivityTypes.Playing;
}

/**
 * Validates the bot configuration and returns any errors
 * @param {BotConfig} config - The configuration to validate
 * @returns {string[]} Array of error messages, empty if valid
 */
export function validateConfig(config) {
    const errors = [];
    
    // Validate bot settings
    if (!config.bot) {
        errors.push('Missing bot configuration');
    } else {
        if (!config.bot.status) {
            errors.push('Missing bot.status configuration');
        } else {
            if (!config.bot.status.type) {
                errors.push('Missing bot.status.type');
            } else if (!Object.values(ActivityTypes).includes(getActivityType(config.bot.status.type))) {
                errors.push(`Invalid bot.status.type: ${config.bot.status.type}`);
            }
            
            if (!config.bot.status.text) {
                errors.push('Missing bot.status.text');
            }
        }
        
        const validPresence = ['online', 'idle', 'dnd', 'invisible'];
        if (!validPresence.includes(config.bot.presence)) {
            errors.push(`Invalid bot.presence: ${config.bot.presence}. Must be one of: ${validPresence.join(', ')}`);
        }
    }
    
    // Validate features
    if (config.features) {
        const validFeatures = ['economy', 'tickets', 'giveaways', 'birthday', 'applications', 'moderation', 'logging', 'counters'];
        for (const feature of Object.keys(config.features)) {
            if (!validFeatures.includes(feature)) {
                console.warn(`Unknown feature flag: ${feature}`);
            }
        }
    }
    
    // Validate applications config
    if (config.features?.applications && config.applications) {
        if (config.applications.defaultQuestions && !Array.isArray(config.applications.defaultQuestions)) {
            errors.push('applications.defaultQuestions must be an array of strings');
        }
        
        if (config.applications.statusColors) {
            const requiredColors = ['pending', 'approved', 'denied'];
            for (const status of requiredColors) {
                if (!config.applications.statusColors[status]) {
                    errors.push(`applications.statusColors.${status} is required`);
                } else if (!/^#(?:[0-9a-fA-F]{3}){1,2}$/.test(config.applications.statusColors[status])) {
                    errors.push(`applications.statusColors.${status} must be a valid hex color code`);
                }
            }
        }
    }
    
    return errors;
}

// Validate the configuration when the module loads
const configErrors = validateConfig(BotConfig);
if (configErrors.length > 0) {
    console.error('Configuration errors found:');
    for (const error of configErrors) {
        console.error(`- ${error}`);
    }
    if (process.env.NODE_ENV === 'production') {
        console.error('Exiting due to configuration errors');
        process.exit(1);
    } else {
        console.warn('Continuing with configuration errors (development mode)');
    }
}
