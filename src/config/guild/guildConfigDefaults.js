import { BotConfig, getCommandPrefix } from '../bot.js';
import { DEFAULT_GUILD_CONFIG } from '../../utils/constants.js';

/**
 * Single source of truth for guild config default values.
 * Used by the guild config service and database read path.
 */
export const GUILD_CONFIG_DEFAULTS = {
    ...DEFAULT_GUILD_CONFIG,
    prefix: getCommandPrefix(),
    welcomeMessage: BotConfig.welcome?.defaultWelcomeMessage || 'Welcome {user} to {server}!',
    dmOnClose: true,
    disabledCommands: {},
    disabledCategories: {},
};
