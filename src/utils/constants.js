








export const DEFAULT_ECONOMY_DATA = {
    wallet: 0,
    bank: 0,
    bankLevel: 0,
    xp: 0,
    level: 1,
    lastDaily: 0,
    lastWork: 0,
    lastCrime: 0,
    lastRob: 0,
    lastMine: 0,
    lastGamble: 0,
    lastFish: 0,
    dailyStreak: 0,
    lastWeekly: 0,
    lastDeposit: 0,
    lastWithdraw: 0,
    inventory: {},
    upgrades: {},
    cooldowns: {}
};





export const DEFAULT_GUILD_CONFIG = {
    logIgnore: { users: [], channels: [] },
    enabledCommands: {},
    reportChannelId: null,
    birthdayChannelId: null,
    premiumRoleId: null,
    modRole: null,
    adminRole: null,
    logChannelId: null,
    welcomeChannel: null,
    autoRole: null,
    logging: {
        enabled: true,
        enabledEvents: {}
    },
    verification: {
        enabled: false
    }
};





export const INTERACTION_TIMEOUTS = {
    EXPIRE: 15 * 60 * 1000,  
    DEFER_TIMEOUT: 3000,      
    REPLY_TIMEOUT: 3000       
};

/**
 * Database and storage limits
 */
export const STORAGE_LIMITS = {
    MAX_EMBED_TITLE: 256,
    MAX_EMBED_DESCRIPTION: 4096,
    MAX_EMBED_FIELDS: 25,
    MAX_EMBED_FIELD_NAME: 256,
    MAX_EMBED_FIELD_VALUE: 1024,
    MAX_BUTTON_LABEL: 80,
    MAX_BUTTON_CUSTOM_ID: 100,
    MAX_SELECT_PLACEHOLDER: 150,
    MAX_USER_INPUT: 2000,
    MAX_CUSTOM_ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
    MAX_BUTTONS_PER_ROW: 5
};





export const DEFAULTS = {
    EMPTY_ARRAY: [],
    EMPTY_OBJECT: {},
    EMPTY_STRING: '',
    ZERO: 0,
    FALSE: false,
    NULL: null
};




export const ERROR_DEFAULTS = {
    INVALID_INPUT: 'Invalid input provided',
    DATABASE_ERROR: 'Database operation failed',
    NOT_FOUND: 'Not found',
    INSUFFICIENT_PERMISSIONS: 'Insufficient permissions',
    INVALID_FORMAT: 'Invalid format'
};




export const TIME = {
    SECOND: 1000,
    MINUTE: 60 * 1000,
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000,
    WEEK: 7 * 24 * 60 * 60 * 1000
};

export default {
    DEFAULT_ECONOMY_DATA,
    DEFAULT_GUILD_CONFIG,
    INTERACTION_TIMEOUTS,
    STORAGE_LIMITS,
    DEFAULTS,
    ERROR_DEFAULTS,
    TIME
};
