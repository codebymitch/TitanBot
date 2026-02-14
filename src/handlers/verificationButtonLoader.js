import verificationButtonHandler from './verificationButtons.js';

/**
 * Load verification button handlers
 * @param {Client} client - Discord client
 */
export async function loadVerificationButtons(client) {
    client.buttons.set(verificationButtonHandler.customId, verificationButtonHandler);
    console.log('✅ Loaded verification button handler');
}

export default { loadVerificationButtons };



