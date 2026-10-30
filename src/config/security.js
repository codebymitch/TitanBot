// security.js — one-time security cleanup asked for by the owner (reports #145, #149, #150, #152).
// Applied once per server on startup (services/securityCleanupService.js); bump CLEANUP_VERSION to
// run it again after changing the lists.

export const CLEANUP_VERSION = 1;

// The only invite link that stays; every other invite of the server is deleted (report #152).
export const MAIN_INVITE_CODE = 'paaHzAssVG';
export const MAIN_INVITE_URL = `https://discord.gg/${MAIN_INVITE_CODE}`;

// Taken out of the Anti-Nuke / Anti-Raid trusted list (reports #149, #150).
export const UNTRUST_USER_IDS = ['1308224908576428079'];
export const UNTRUST_ROLE_IDS = ['1547448260661084161'];
