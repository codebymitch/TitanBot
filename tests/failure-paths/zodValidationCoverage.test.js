import test from 'node:test';
import assert from 'node:assert/strict';

import { validateChatInputPayloadOrThrow } from '../../src/utils/commandInputValidation.js';
import { validateGuildConfigOrThrow } from '../../src/utils/schemas.js';

test('zod command input validation accepts valid command payload', () => {
  const interaction = {
    commandName: 'ping',
    options: {
      data: [
        { name: 'target', type: 3, value: 'user123' },
        { name: 'count', type: 4, value: 3 }
      ]
    }
  };

  const result = validateChatInputPayloadOrThrow(interaction);
  assert.equal(result.commandName, 'ping');
  assert.equal(result.options.length, 2);
});

test('zod command input validation rejects invalid option payload shape', () => {
  const interaction = {
    commandName: 'ping',
    options: {
      data: [
        { name: 'bad', type: 3, value: { nested: 'not-allowed' } }
      ]
    }
  };

  assert.throws(
    () => validateChatInputPayloadOrThrow(interaction),
    /Invalid command input payload/
  );
});

test('zod guild config validation accepts valid config write payload', () => {
  const config = {
    prefix: '!',
    logging: {
      enabled: true,
      enabledEvents: {
        'message.delete': true
      }
    },
    logIgnore: {
      users: ['123'],
      channels: ['456']
    }
  };

  const validated = validateGuildConfigOrThrow(config);
  assert.equal(validated.prefix, '!');
  assert.equal(validated.logging.enabled, true);
});

test('zod guild config validation rejects invalid config write payload', () => {
  const invalidConfig = {
    prefix: '!',
    logging: {
      enabled: 'yes',
      enabledEvents: {}
    }
  };

  assert.throws(
    () => validateGuildConfigOrThrow(invalidConfig),
    /Invalid guild configuration payload/
  );
});
