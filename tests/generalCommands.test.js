import assert from 'node:assert/strict';
import test from 'node:test';
import { Collection, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { createHelpView, formatUptime, generalCommand, getVisibleHelpCommands, HELP_CATEGORIES } from '../src/commands/general/factory.js';

test('all requested general slash commands have Hebrew descriptions and valid options', () => {
  for (const name of ['help', 'ping', 'botinfo', 'serverinfo', 'userinfo', 'avatar']) {
    const json = generalCommand(name).data.toJSON();
    assert.equal(json.name, name);
    assert.match(json.description, /[\u0590-\u05ff]/);
    assert.equal(json.dm_permission, false);
    assert.equal(json.options?.length || 0, ['userinfo', 'avatar'].includes(name) ? 1 : 0);
  }
});

test('help view contains all six categories and a select menu bound to the requesting user', () => {
  const command = generalCommand('ping');
  command.category = 'general';
  const payload = createHelpView([command], null, '123');
  const embed = payload.embeds[0].toJSON();
  const menu = payload.components[0].toJSON().components[0];
  assert.equal(embed.fields.length, 6);
  assert.equal(menu.custom_id, 'general_help:123');
  assert.deepEqual(menu.options.map(option => option.value), Object.keys(HELP_CATEGORIES));
});

test('help visibility respects access levels, disabled commands and Discord permissions', async () => {
  const make = (name, category, permission = null) => {
    const data = new SlashCommandBuilder().setName(name).setDescription('test command');
    if (permission) data.setDefaultMemberPermissions(permission);
    return { data, category };
  };
  const client = {
    commands: new Collection([
      ['ping', make('ping', 'general')],
      ['rank', make('rank', 'levels')],
      ['ban', make('ban', 'moderation')],
      ['settings', make('settings', 'admin', PermissionFlagsBits.ManageGuild)],
      ['avatar', make('avatar', 'general')]
    ]),
    db: { get: async () => ({ commandSettings: { avatar: { enabled: false } }, commandPermissions: {} }) }
  };
  const interaction = {
    guildId: 'guild', user: { id: 'user' }, guild: { ownerId: 'owner' },
    inGuild: () => true,
    member: { roles: { cache: { has: () => false } }, permissions: { has: () => false } }
  };
  const visible = await getVisibleHelpCommands(interaction, client);
  assert.deepEqual(visible.map(command => command.data.name), ['ping']);
});

test('uptime formatter produces stable Hebrew output', () => {
  assert.equal(formatUptime(90060), '1 ימים, 1 שעות, 1 דקות');
  assert.equal(formatUptime(0), '0 דקות');
});
