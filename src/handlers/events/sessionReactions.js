/**
 * registerSessionReactions(client)
 * - Listens for messageReactionAdd and messageReactionRemove
 * - When required non-bot reactions on a pending startup announcement are reached,
 *   posts the setup embed and clears pendingSessions entry.
 *
 * Put this file at: src/handlers/events/sessionReactions.js
 * and call registerSessionReactions(client) after your client is created and client.config is loaded.
 */

export function registerSessionReactions(client) {
  const targetEmojiStr = '<:pinkcheckmark:1502780778449342494>';

  client.on('messageReactionAdd', async (reaction, user) => {
    if (!client.pendingSessions) return;
    if (user?.bot) return;

    try {
      if (reaction.partial) await reaction.fetch();
    } catch {
      return;
    }

    const messageId = String(reaction.message?.id);
    if (!client.pendingSessions.has(messageId)) return;

    const data = client.pendingSessions.get(messageId);
    if (!data || data.type !== 'startup') return;

    // Only handle target emoji
    if (String(reaction.emoji?.toString?.()) !== targetEmojiStr) return;

    // Fetch users for the reaction and filter bots
    let users;
    try {
      users = await reaction.users.fetch();
    } catch {
      users = new Map();
    }
    const humanCount = Array.from(users.values()).filter((u) => !u.bot).length;

    // If we haven't reached required reactions yet, update sessionStates and bail
    if (humanCount < Number(data.required)) {
      if (client.sessionStates) {
        for (const [, state] of client.sessionStates) {
          if (String(state.messageId) === messageId) {
            if (!state.reactors) state.reactors = new Set();
            state.reactors.add(user.id);
            break;
          }
        }
      }
      return;
    }

    // Enough reactions reached — post the setup embed and clean up pendingSessions
    const channel = reaction.message.channel || (await client.channels.fetch(reaction.message.channelId).catch(() => null));
    if (!channel) return;

    const ecfg = (client.config && client.config.embeds && client.config.embeds.setup) || {};
    const embed = {
      title: ecfg.title || '_Greenville Roleplay Legacy_ - ___Roleplay Preparation:___',
      description: (ecfg.description || '').replace(/\{user\}/g, data.user),
      color: 0xadcf8b,
    };
    if (ecfg.image_url) embed.image = { url: ecfg.image_url };
    if (client.config?.bot?.footer_text || client.config?.bot?.footer_icon) {
      embed.footer = {
        text: client.config.bot.footer_text || '',
        icon_url: client.config.bot.footer_icon || '',
      };
    }

    await channel.send({ embeds: [embed] }).catch(() => null);
    client.pendingSessions.delete(messageId);
  });

  client.on('messageReactionRemove', async (reaction, user) => {
    if (!client.sessionStates) return;
    if (!reaction) return;

    try {
      if (reaction.partial) await reaction.fetch();
    } catch {
      return;
    }

    for (const [, state] of client.sessionStates) {
      if (String(state.messageId) === String(reaction.message?.id) && String(reaction.emoji?.toString?.()) === targetEmojiStr) {
        if (state.reactors && state.reactors.delete) state.reactors.delete(user?.id);
        break;
      }
    }
  });
}
