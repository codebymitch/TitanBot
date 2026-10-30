import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hideSpotCount, huntSpotCount, createSpots, placeLeftovers, openSpot, huntOutcome, boardChunks, HIDE_LIMITS, HUNT_LIMITS } from '../src/services/games/hideGames.js';

describe('hide games', () => {
  test('there are 3 empty squares / fake sheep for every real hider', () => {
    assert.equal(hideSpotCount(3), 12);
    assert.equal(hideSpotCount(12), 48);
    assert.equal(huntSpotCount(2), 8);
    assert.equal(huntSpotCount(11), 44);
  });

  test('big grids are split into messages of 25 squares', () => {
    assert.deepEqual(boardChunks(createSpots(12)).map((chunk) => chunk.length), [12]);
    assert.deepEqual(boardChunks(createSpots(48)).map((chunk) => chunk.length), [25, 23]);
    assert.equal(boardChunks(createSpots(48))[1][0].index, 25);
    assert.ok(Math.max(hideSpotCount(HIDE_LIMITS.max), huntSpotCount(HUNT_LIMITS.max - 1)) <= 50);
  });

  test('players who did not hide get a free square', () => {
    const spots = createSpots(5);
    spots[0].occupant = 'a';
    placeLeftovers(spots, ['a', 'b', 'c'], (list) => list);
    assert.deepEqual(spots.map((spot) => spot.occupant), ['a', 'b', 'c', null, null]);
  });

  test('opening a square finds the hider or reports it empty', () => {
    const spots = createSpots(3);
    spots[1].occupant = 'b';
    assert.equal(openSpot(spots, 0), null);
    assert.equal(spots[0].result, 'empty');
    assert.equal(openSpot(spots, 1), 'b');
    assert.equal(spots[1].result, 'found');
  });

  test('hunt: hunter wins by catching everyone, sheep win when the fake sheep run out', () => {
    assert.equal(huntOutcome({ sheepLeft: 0, misses: 2, fakeCount: 4 }), 'hunter');
    assert.equal(huntOutcome({ sheepLeft: 1, misses: 4, fakeCount: 4 }), 'sheep');
    assert.equal(huntOutcome({ sheepLeft: 2, misses: 1, fakeCount: 4 }), null);
  });
});
