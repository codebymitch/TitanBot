import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isCommandEnabledInConfig,
  getCommandAccessSnapshot,
  buildCommandRegistry,
  resolveCategoryChoice,
} from '../src/services/commandAccessService.js';

const mockClient = {
  commands: new Map([
    ['balance', { data: { name: 'balance', description: 'Check balance' }, category: 'Economy' }],
    ['daily', { data: { name: 'daily', description: 'Daily reward' }, category: 'Economy' }],
    ['ping', { data: { name: 'ping', description: 'Ping' }, category: 'Core' }],
    ['commands', { data: { name: 'commands', description: 'Manage commands' }, category: 'Core' }],
    ['configwizard', { data: { name: 'configwizard', description: 'Config wizard' }, category: 'Core' }],
  ]),
};

test('isCommandEnabledInConfig respects category and command disables', () => {
  const config = {
    disabledCategories: { economy: true },
    disabledCommands: {},
  };

  assert.equal(isCommandEnabledInConfig(config, 'balance', 'Economy'), false);
  assert.equal(isCommandEnabledInConfig(config, 'ping', 'Core'), true);
});

test('isCommandEnabledInConfig keeps protected commands available', () => {
  const config = {
    disabledCategories: { core: true },
    disabledCommands: { commands: true, configwizard: true },
  };

  assert.equal(isCommandEnabledInConfig(config, 'commands', 'Core'), true);
  assert.equal(isCommandEnabledInConfig(config, 'configwizard', 'Core'), true);
  assert.equal(isCommandEnabledInConfig(config, 'ping', 'Core'), false);
});

test('isCommandEnabledInConfig supports legacy array disabledCommands', () => {
  const config = {
    disabledCategories: {},
    disabledCommands: ['urban', 'flip'],
  };

  assert.equal(isCommandEnabledInConfig(config, 'urban', 'Search'), false);
  assert.equal(isCommandEnabledInConfig(config, 'flip', 'Fun'), false);
});

test('getCommandAccessSnapshot summarizes category state', () => {
  const config = {
    disabledCategories: { economy: true },
    disabledCommands: { ping: true },
  };

  const snapshot = getCommandAccessSnapshot(mockClient, config);
  const economy = snapshot.categories.find((category) => category.key === 'economy');
  const core = snapshot.categories.find((category) => category.key === 'core');

  assert.equal(economy.categoryDisabled, true);
  assert.equal(core.disabledCount, 1);
  assert.equal(snapshot.enabledTotal, 2);
});

test('buildCommandRegistry groups commands by category folder', () => {
  const registry = buildCommandRegistry(mockClient);
  assert.equal(registry.get('economy')?.commands.length, 2);
  assert.equal(registry.get('core')?.commands.length, 3);
});

test('isCommandEnabledInConfig supports subcommand-level disables', () => {
  const config = {
    disabledCategories: {},
    disabledCommands: { 'birthday list': true },
  };

  assert.equal(isCommandEnabledInConfig(config, 'birthday list', 'Birthday'), false);
  assert.equal(isCommandEnabledInConfig(config, 'birthday info', 'Birthday'), true);
});
