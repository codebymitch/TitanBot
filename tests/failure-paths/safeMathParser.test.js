import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateMathExpression } from '../../src/utils/safeMathParser.js';

test('safe parser evaluates arithmetic precedence correctly', () => {
  const result = evaluateMathExpression('2 + 2 * 3');
  assert.equal(result, 8);
});

test('safe parser evaluates trig with degree conversion', () => {
  const result = evaluateMathExpression('sin(45 deg)');
  assert.ok(Math.abs(result - 0.7071067811865476) < 1e-10);
});

test('safe parser supports constants and exponent operator', () => {
  const result = evaluateMathExpression('pi ^ 2');
  assert.ok(Math.abs(result - (Math.PI ** 2)) < 1e-10);
});

test('safe parser rejects code-like tokens', () => {
  assert.throws(
    () => evaluateMathExpression('process.exit()'),
    /Unsupported token|Unsupported character/
  );
});

test('safe parser rejects malformed expressions', () => {
  assert.throws(
    () => evaluateMathExpression('2 + (3 * 4'),
    /Mismatched parentheses/
  );
});
