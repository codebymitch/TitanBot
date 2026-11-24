import { PermissionsBitField } from 'discord.js';

export function isAdministrator(interaction) {
  return Boolean(interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator));
}

export async function requireAdministrator(interaction) {
  if (isAdministrator(interaction)) return true;

  await interaction.reply({
    content: 'Pengaturan ini hanya bisa diubah Administrator server.',
    ephemeral: true,
  });
  return false;
}
