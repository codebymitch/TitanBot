import { EmbedBuilder } from 'discord.js';

let logChannel = null;

export function setLogChannel(channel) {
  logChannel = channel;
}

export async function sendLog({
  title,
  description,
  color = 0x2b2d31,
  fields = [],
  thumbnail = null
}) {
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();

  if (fields.length) embed.addFields(fields);
  if (thumbnail) embed.setThumbnail(thumbnail);

  try {
    await logChannel.send({ embeds: [embed] });
  } catch (err) {
    console.error('Error enviando log:', err);
  }
}