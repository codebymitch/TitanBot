import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import {
  resolveLegacyName,
  routeLegacyPrefixCommand,
  toStoredAccessKey,
  translateLegacyAccessKey,
} from '../src/config/commands/legacyCommandMap.js';
import { Collection } from 'discord.js';
import { buildCommandRegistry, isCommandEnabledInConfig, resolveAccessTarget } from '../src/services/commandAccessService.js';
import type { NexoClient } from '../src/types/index.js';
import { mapArgumentsToOptions } from '../src/utils/prefixParser.js';
import { getPrefixRestriction } from '../src/config/commands/prefixRestrictions.js';
import { createRouterCommand } from '../src/utils/commandRouter.js';
import type { Command } from '../src/types/index.js';

test('stored legacy access keys translate to the new paths', () => {
  assert.equal(translateLegacyAccessKey('balance'), 'eco balance');
  assert.equal(translateLegacyAccessKey('usernotes add'), 'msg notes add');
  assert.equal(translateLegacyAccessKey('shop-config setrole'), 'economy shop setrole');
  assert.equal(translateLegacyAccessKey('welcome setup'), 'welcome message setup');
  // A bare old name keeps its old meaning; whole new commands are stored as `<name> *`.
  assert.equal(translateLegacyAccessKey('ban'), 'ban user');
  assert.equal(translateLegacyAccessKey('welcome'), 'welcome message');
  assert.equal(translateLegacyAccessKey('ban *'), 'ban');
  assert.equal(toStoredAccessKey('ban'), 'ban *');
  assert.equal(toStoredAccessKey('ban remove'), 'ban remove');
  assert.equal(toStoredAccessKey('eco'), 'eco');
  assert.equal(translateLegacyAccessKey('welcome autorole add'), 'welcome autorole add');
  assert.equal(translateLegacyAccessKey('music pause'), 'music pause');
});

test('disabled legacy commands and categories block the new subcommands', () => {
  const config = { disabledCommands: { balance: true, usernotes: true }, disabledCategories: { utility: true } };
  assert.equal(isCommandEnabledInConfig(config, 'eco balance', 'Economy'), false);
  assert.equal(isCommandEnabledInConfig(config, 'eco work', 'Economy'), true);
  assert.equal(isCommandEnabledInConfig(config, 'msg notes add', 'Moderation'), false);
  assert.equal(isCommandEnabledInConfig(config, 'msg purge', 'Moderation'), true);
  assert.equal(isCommandEnabledInConfig(config, 'tools weather', 'Tools'), false);
  assert.equal(isCommandEnabledInConfig(config, 'tools hexcolor', 'Tools'), true);
  assert.equal(isCommandEnabledInConfig({ disabledCommands: ['commands'] }, 'commands disable', 'Core'), true);

  // An old `/ban` disable only blocks `/ban user`; a new whole-command disable blocks everything.
  assert.equal(isCommandEnabledInConfig({ disabledCommands: { ban: true } }, 'ban user', 'Moderation'), false);
  assert.equal(isCommandEnabledInConfig({ disabledCommands: { ban: true } }, 'ban remove', 'Moderation'), true);
  assert.equal(isCommandEnabledInConfig({ disabledCommands: { ban: true } }, 'ban', 'Moderation'), true);
  assert.equal(isCommandEnabledInConfig({ disabledCommands: { 'ban *': true } }, 'ban remove', 'Moderation'), false);
});

test('prefix invocations with old names are routed', () => {
  assert.deepEqual(routeLegacyPrefixCommand('balance', ['@x']), { commandName: 'eco', args: ['balance', '@x'] });
  assert.deepEqual(routeLegacyPrefixCommand('ban', ['@x', 'spam']), { commandName: 'ban', args: ['user', '@x', 'spam'] });
  assert.equal(routeLegacyPrefixCommand('ban', ['remove', '@x']), null);
  assert.deepEqual(routeLegacyPrefixCommand('welcome', ['setup']), { commandName: 'welcome', args: ['message', 'setup'] });
  assert.deepEqual(routeLegacyPrefixCommand('usernotes', ['view', '@x']), { commandName: 'msg', args: ['notes', 'view', '@x'] });
  assert.equal(routeLegacyPrefixCommand('rank', ['leaderboard']), null);
  assert.equal(routeLegacyPrefixCommand('todo', ['add']), null);
});

test('new paths resolve back to the old command name', () => {
  assert.equal(resolveLegacyName('mod', null, 'warn'), 'warn');
  assert.equal(resolveLegacyName('msg', 'notes', 'add'), 'usernotes');
  assert.equal(resolveLegacyName('eco', null, 'leaderboard'), 'eleaderboard');
  assert.equal(resolveLegacyName('music', null, 'pause'), null);
});

function fakeCommand(builder: { toJSON(): ReturnType<SlashCommandBuilder['toJSON']>; name: string }, calls: string[]): Command {
  return {
    data: builder,
    async execute(interaction) {
      calls.push(`${builder.name}:${interaction.options.getSubcommand(false) ?? '-'}`);
    },
  };
}

test('router builds subcommands/groups and dispatches to the old modules', async () => {
  const calls: string[] = [];
  const purge = fakeCommand(new SlashCommandBuilder().setName('purge').setDescription('Purge')
    .addIntegerOption((o) => o.setName('amount').setDescription('n').setRequired(true)), calls);
  const notes = fakeCommand(new SlashCommandBuilder().setName('usernotes').setDescription('Notes')
    .addSubcommand((s) => s.setName('add').setDescription('Add'))
    .addSubcommand((s) => s.setName('view').setDescription('View')), calls);
  const router = createRouterCommand({
    name: 'msg',
    description: 'Messages',
    category: 'Moderation',
    routes: [{ legacyName: 'purge', module: purge }, { legacyName: 'usernotes', module: notes }],
  });

  const json = router.data.toJSON();
  assert.deepEqual(json.options?.map((o) => [o.name, o.type]), [['purge', 1], ['notes', 2]]);

  const invoke = (group: string | null, sub: string | null) => ({
    guildId: 'g',
    options: { getSubcommandGroup: () => group, getSubcommand: () => sub },
  }) as unknown as ChatInputCommandInteraction; // minimal stand-in for the two option getters the router reads

  await router.execute(invoke(null, 'purge'), null, {} as never);
  await router.execute(invoke('notes', 'view'), null, {} as never);
  assert.deepEqual(calls, ['purge:purge', 'usernotes:view']);
  assert.equal(router.resolveRoute?.('notes', 'add')?.legacyName, 'usernotes');
});

test('prefix parser handles commands mixing subcommands and groups', () => {
  const data = {
    name: 'msg',
    options: [
      { name: 'purge', type: 1, options: [{ name: 'amount', type: 4, required: true }] },
      { name: 'notes', type: 2, options: [{ name: 'view', type: 1, options: [{ name: 'target', type: 6, required: true }] }] },
    ],
  };
  const purge = mapArgumentsToOptions(['purge', '10'], data);
  assert.equal(purge.getSubcommand(), 'purge');
  assert.equal(purge.getString('amount'), '10');

  const view = mapArgumentsToOptions(['notes', 'view', '123'], data);
  assert.equal(view.getSubcommandGroup(), 'notes');
  assert.equal(view.getSubcommand(), 'view');
  assert.equal(view.validateRequired().valid, true);

  // An exact subcommand name wins over the "roll" -> "reroll" alias.
  const fun = mapArgumentsToOptions(['roll'], { name: 'fun', options: [{ name: 'roll', type: 1 }] });
  assert.equal(fun.getSubcommand(), 'roll');
});

test('/commands resolves old names, including ones mapped to a group', () => {
  const notes = fakeCommand(new SlashCommandBuilder().setName('usernotes').setDescription('Notes')
    .addSubcommand((s) => s.setName('add').setDescription('Add')), []);
  const balance = fakeCommand(new SlashCommandBuilder().setName('balance').setDescription('Balance'), []);
  const msg = { ...createRouterCommand({ name: 'msg', description: 'Messages', category: 'Moderation', routes: [{ legacyName: 'usernotes', module: notes }] }), category: 'Moderation' };
  const eco = { ...createRouterCommand({ name: 'eco', description: 'Economy', category: 'Economy', routes: [{ legacyName: 'balance', module: balance }] }), category: 'Economy' };
  const client = { commands: new Collection([['msg', msg], ['eco', eco]]) } as unknown as NexoClient; // only .commands is read

  const names = [...buildCommandRegistry(client).values()].flatMap((category) => category.commands.map((command) => command.name));
  assert.ok(names.includes('msg notes'), 'group node is toggleable');
  assert.equal(resolveAccessTarget(client, 'usernotes')?.name, 'msg notes');
  assert.equal(resolveAccessTarget(client, 'balance')?.name, 'eco balance');
  assert.equal(resolveAccessTarget(client, 'msg notes add')?.name, 'msg notes add');
  assert.equal(resolveAccessTarget(client, 'nope'), null);
});

test('prefix blocks routed subcommands whose old command was slash-only', () => {
  const shop = { ...fakeCommand(new SlashCommandBuilder().setName('shop').setDescription('Shop'), []), slashOnly: true };
  const work = fakeCommand(new SlashCommandBuilder().setName('work').setDescription('Work'), []);
  const eco = createRouterCommand({
    name: 'eco', description: 'Economy', category: 'Economy',
    routes: [{ legacyName: 'shop', module: shop }, { legacyName: 'work', module: work }],
  });
  const keep = (name: string) => name;
  assert.equal(getPrefixRestriction(eco, ['shop'], keep).blocked, true);
  assert.equal(getPrefixRestriction(eco, ['work'], keep).blocked, false);
});
