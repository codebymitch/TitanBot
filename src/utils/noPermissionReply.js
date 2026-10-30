// "No Permission" replies to message commands disappear after a few seconds so they don't clutter chat.
export const NO_PERMISSION_DELETE_MS = 5_000;

export function isNoPermissionReply(content) {
  return typeof content === 'string' && content.startsWith('🚫');
}

/** Deletes `sentMessage` after 5 seconds when it is a 🚫 permission reply. Returns the message unchanged. */
export function scheduleNoPermissionDelete(sentMessage) {
  if (sentMessage && isNoPermissionReply(sentMessage.content)) {
    setTimeout(() => sentMessage.delete().catch(() => {}), NO_PERMISSION_DELETE_MS);
  }
  return sentMessage;
}
