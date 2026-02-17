const DEFAULT_TEMPLATES = {
    welcome: 'Welcome {user} to {server}!',
    goodbye: '{user.tag} has left the server.'
};

function replaceAll(message, token, value) {
    if (value === undefined || value === null) {
        return message;
    }
    return message.split(token).join(String(value));
}

/**
 * @param {string} message 
 * @param {Object} data 
 * @returns {string} 
 */
export function formatWelcomeMessage(message, data) {
    const template = message || '';
    if (!template) return '';

    const user = data?.user;
    const guild = data?.guild;

    const tokens = {
        '{user}': user?.toString(),
        '{user.mention}': user?.toString(),
        '{user.tag}': user?.tag,
        '{user.username}': user?.username,
        '{username}': user?.username,
        '{user.discriminator}': user?.discriminator,
        '{user.id}': user?.id,
        '{server}': guild?.name,
        '{server.name}': guild?.name,
        '{guild.name}': guild?.name,
        '{guild.id}': guild?.id,
        '{guild.memberCount}': guild?.memberCount,
        '{memberCount}': guild?.memberCount,
        '{membercount}': guild?.memberCount
    };

    let result = template;
    for (const [token, value] of Object.entries(tokens)) {
        result = replaceAll(result, token, value);
    }

    return result;
}

export function getDefaultWelcomeMessage() {
    return DEFAULT_TEMPLATES.welcome;
}

export function getDefaultGoodbyeMessage() {
    return DEFAULT_TEMPLATES.goodbye;
}


