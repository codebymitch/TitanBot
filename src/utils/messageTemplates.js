import { EmbedBuilder } from 'discord.js';

/**
 * Message templates for consistent bot responses
 */
export const MessageTemplates = {
    SUCCESS: {
        DATA_UPDATED: (action, description) => new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle(`✅ ${action.charAt(0).toUpperCase() + action.slice(1)} Successful`)
            .setDescription(description)
            .setTimestamp(),
        
        COMMAND_EXECUTED: (command) => new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ Command Executed')
            .setDescription(`Successfully executed \`${command}\``)
            .setTimestamp()
    },

    ERRORS: {
        DATABASE_ERROR: (operation) => new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('🗄️ Database Error')
            .setDescription(`I'm having trouble with my database while ${operation}. Please try again later.`)
            .setTimestamp(),
        
        INSUFFICIENT_FUNDS: (currency, description) => new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle('💰 Insufficient Funds')
            .setDescription(description || `You don't have enough ${currency} for this operation.`)
            .setTimestamp(),
        
        PERMISSION_DENIED: (permission) => new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('🚫 Permission Denied')
            .setDescription(`You need the \`${permission}\` permission to use this command.`)
            .setTimestamp(),
        
        INVALID_INPUT: (field) => new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle('❌ Invalid Input')
            .setDescription(`The ${field || 'input'} you provided is invalid. Please check and try again.`)
            .setTimestamp()
    },

    INFO: {
        LOADING: (description) => new EmbedBuilder()
            .setColor('#ffff00')
            .setTitle('⏳ Loading...')
            .setDescription(description || 'Please wait while I process your request.')
            .setTimestamp(),
        
        PROCESSING: (description) => new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('⚙️ Processing')
            .setDescription(description || 'Processing your request...')
            .setTimestamp()
    }
};

export const ContextualMessages = {
    configUpdated: (title, configLines) => new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle(`✅ ${title} Updated`)
        .setDescription(configLines.join('\n'))
        .setTimestamp()
};

export default MessageTemplates;



