import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toConfigLiteral } from '../src/commands/Economy/modules/economy_dashboard.js';

test('currency values that could break the config source are rejected', () => {
  assert.equal(toConfigLiteral('Münzen'), '"Münzen"');
  assert.equal(toConfigLiteral('€'), '"€"');
  assert.equal(toConfigLiteral('"'), null);
  assert.equal(toConfigLiteral('"+process.exit()+"'), null);
  assert.equal(toConfigLiteral('a\\b'), null);
  assert.equal(toConfigLiteral('a\nb'), null);
});
