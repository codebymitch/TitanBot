/**
 * Bot Configuration
 * Centralized configuration for Titan Bot
 */

// Default bot configuration
export const botConfig = {
  // Bot presence and status
  presence: {
    status: 'online',
    activities: [{
      name: '/help | Titan Bot',
      type: 'PLAYING'
    }]
  },

  // Command settings
  commands: {
    prefix: '!',
    owners: process.env.OWNER_IDS?.split(',') || [],
    defaultCooldown: 3, // seconds
    deleteCommands: false,
    testGuildId: process.env.TEST_GUILD_ID
  },

  // Legacy prefix for backward compatibility
  prefix: '!',

  // Application system settings
  applications: {
    defaultQuestions: [
      { question: 'What is your name?', required: true },
      { question: 'How old are you?', required: true },
      { question: 'Why do you want to join?', required: true }
    ],
    statusColors: {
      pending: '#FFA500',
      approved: '#00FF00',
      denied: '#FF0000'
    },
    applicationCooldown: 24, // hours
    deleteDeniedAfter: 7, // days
    deleteApprovedAfter: 30, // days
    managerRoles: [] // Will be populated from environment or database
  },

  // Embed theming
  embeds: {
    colors: {
      primary: '#5865F2',
      success: '#57F287',
      error: '#ED4245',
      warning: '#FEE75C',
      info: '#3498DB',
      giveaway: {
        active: '#57F287',
        ended: '#ED4245'
      },
      ticket: {
        open: '#57F287',
        closed: '#ED4245'
      },
      economy: '#F1C40F',
      birthday: '#E91E63',
      moderation: '#9B59B6'
    },
    footer: {
      text: 'Titan Bot',
      icon: null
    },
    thumbnail: null,
    author: {
      name: null,
      icon: null,
      url: null
    }
  },

  // Economy settings
  economy: {
    currency: {
      name: 'coins',
      namePlural: 'coins',
      symbol: '$'
    },
    startingBalance: 0,
    baseBankCapacity: 100000,
    dailyAmount: 100,
    workMin: 10,
    workMax: 100,
    begMin: 5,
    begMax: 50,
    robSuccessRate: 0.4,
    robFailJailTime: 3600000 // 1 hour in ms
  },

  // Shop settings
  shop: {
    // Will be imported from shop/index.js
  },

  // Ticket system settings
  tickets: {
    defaultCategory: null,
    supportRoles: [],
    priorities: {
      none: {
        emoji: '⚪',
        color: '#95A5A6',
        label: 'None'
      },
      low: {
        emoji: '🟢',
        color: '#2ECC71',
        label: 'Low'
      },
      medium: {
        emoji: '🟡',
        color: '#F1C40F',
        label: 'Medium'
      },
      high: {
        emoji: '🔴',
        color: '#E74C3C',
        label: 'High'
      },
      urgent: {
        emoji: '🚨',
        color: '#E91E63',
        label: 'Urgent'
      }
    },
    defaultPriority: 'none',
    archiveCategory: null,
    logChannel: null
  },

  // Giveaway system settings
  giveaways: {
    defaultDuration: 86400000, // 24 hours
    minimumWinners: 1,
    maximumWinners: 10,
    minimumDuration: 300000, // 5 minutes
    maximumDuration: 2592000000, // 30 days
    allowedRoles: [],
    bypassRoles: []
  },

  // Birthday system settings
  birthday: {
    defaultRole: null,
    announcementChannel: null,
    timezone: 'UTC'
  },

  // Welcome system settings
  welcome: {
    defaultWelcomeMessage: 'Welcome {user} to {server}! We now have {memberCount} members!',
    defaultGoodbyeMessage: '{user} has left the server. We now have {memberCount} members.',
    defaultWelcomeChannel: null,
    defaultGoodbyeChannel: null
  },

  // Counter system settings
  counters: {
    defaults: {
      name: '{name} Counter',
      description: 'Server {name} counter',
      type: 'voice',
      channelName: '{name}-{count}'
    },
    permissions: {
      deny: ['VIEW_CHANNEL'],
      allow: ['VIEW_CHANNEL', 'CONNECT', 'SPEAK']
    },
    messages: {
      created: '✅ Created counter **{name}**',
      deleted: '🗑️ Deleted counter **{name}**',
      updated: '🔄 Updated counter **{name}**'
    },
    types: {
      members: {
        name: '👥 Members',
        description: 'Total members in the server',
        getCount: (guild) => guild.memberCount.toString()
      },
      bots: {
        name: '🤖 Bots',
        description: 'Total bot accounts in the server',
        getCount: (guild) => guild.members.cache.filter(m => m.user.bot).size.toString()
      },
      members_only: {
        name: '👤 Humans',
        description: 'Total human members (non-bots)',
        getCount: (guild) => guild.members.cache.filter(m => !m.user.bot).size.toString()
      }
    }
  },

  // Economy system settings
  economy: {
    currency: {
      name: 'Coin',
      namePlural: 'Coins',
      symbol: '🪙'
    },
    startingBalance: 1000,
    baseBankCapacity: 10000,
    dailyAmount: 100,
    workMin: 50,
    workMax: 200,
    begMin: 10,
    begMax: 50,
    robSuccessRate: 0.3,
    robFailJailTime: 300000 // 5 minutes
  },

  // Ticket system settings
  tickets: {
    defaultCategory: null,
    supportRoles: [],
    priorities: {
      none: { emoji: '🔘', color: '#95a5a6', label: 'None' },
      low: { emoji: '🟢', color: '#2ecc71', label: 'Low' },
      medium: { emoji: '🟡', color: '#f1c40f', label: 'Medium' },
      high: { emoji: '🟠', color: '#e67e22', label: 'High' },
      urgent: { emoji: '🔴', color: '#e74c3c', label: 'Urgent' }
    },
    defaultPriority: 'none',
    archiveCategory: null,
    logChannel: null
  },

  // Giveaway system settings
  giveaways: {
    defaultDuration: 86400000, // 24 hours
    minimumWinners: 1,
    maximumWinners: 10,
    minimumDuration: 300000, // 5 minutes
    maximumDuration: 2592000000, // 30 days
    allowedRoles: [],
    bypassRoles: []
  },

  // Birthday system settings
  birthday: {
    defaultRole: null,
    announcementChannel: null,
    timezone: 'UTC'
  },

  // System messages
  messages: {
    noPermission: 'You do not have permission to use this command.',
    cooldownActive: 'Please wait {time} before using this command again.',
    errorOccurred: 'An error occurred while executing this command.',
    missingPermissions: 'I am missing required permissions to perform this action.',
    commandDisabled: 'This command has been disabled.',
    maintenanceMode: 'The bot is currently in maintenance mode.'
  },

  // Feature toggles
  features: {
    music: false,
    economy: true,
    tickets: true,
    giveaways: true,
    birthday: true,
    moderation: true,
    logging: true,
    welcome: true
  }
};

/**
 * Validates the bot configuration
 * @param {Object} config - The configuration to validate
 * @returns {string[]} Array of error messages, empty if valid
 */
export function validateConfig(config) {
  const errors = [];
  
  if (!process.env.TOKEN) {
    errors.push('Bot token is required (TOKEN environment variable)');
  }
  
  if (!process.env.CLIENT_ID) {
    errors.push('Client ID is required (CLIENT_ID environment variable)');
  }
  
  // Add more validations as needed
  
  return errors;
}

// Validate the configuration when imported
const configErrors = validateConfig(botConfig);
if (configErrors.length > 0) {
  console.error('Bot configuration errors:', configErrors.join('\n'));
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

// Export as BotConfig for backward compatibility
export const BotConfig = botConfig;

export default botConfig;
