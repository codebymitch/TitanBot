import test from 'node:test';
import assert from 'node:assert/strict';
import { clampCommunityXp, communityLevelFromXp, MAX_COMMUNITY_XP, MAX_LEVEL } from '../src/utils/levelLimits.js';
import { levelCommand } from '../src/commands/levels/factory.js';
import { getLevelFromXp, getXpForLevel } from '../src/services/leveling.js';

test('community leveling has a hard level 50 and XP cap', () => {
  assert.equal(MAX_LEVEL, 50);
  assert.equal(MAX_COMMUNITY_XP, 250000);
  assert.equal(communityLevelFromXp(MAX_COMMUNITY_XP), 50);
  assert.equal(communityLevelFromXp(Number.MAX_SAFE_INTEGER), 50);
  assert.equal(clampCommunityXp(Number.MAX_SAFE_INTEGER), MAX_COMMUNITY_XP);
});

test('/setxp cannot accept XP beyond the level-50 threshold', () => {
  const option=levelCommand('setxp').data.toJSON().options.find(value=>value.name==='xp');
  assert.equal(option.max_value,MAX_COMMUNITY_XP);
});

test('legacy leveling service also caps calculations at level 50', () => {
  assert.equal(getLevelFromXp(Number.MAX_SAFE_INTEGER).level,50);
  assert.throws(()=>getXpForLevel(51));
});
