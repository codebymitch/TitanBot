import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { findUsedInvite, countInvitesBy } from '../src/services/inviteTrackerService.js';
import { findWinner } from '../src/commands/Fun/xo.js';
import { decide } from '../src/commands/Fun/rps.js';
import { inviteAnswer, INVITE_MS } from '../src/services/games/challenge.js';

const invites = (entries) => new Map(Object.entries(entries));

describe('invite tracker', () => {
  test('finds the invite whose use count went up', () => {
    const before = invites({ abc: { uses: 2, maxUses: 0, inviterId: 'u1' }, def: { uses: 5, maxUses: 0, inviterId: 'u2' } });
    const after = invites({ abc: { uses: 2, maxUses: 0, inviterId: 'u1' }, def: { uses: 6, maxUses: 0, inviterId: 'u2' } });
    assert.equal(findUsedInvite(before, after).code, 'def');
  });

  test('counts a brand new invite used right away', () => {
    const used = findUsedInvite(invites({}), invites({ new1: { uses: 1, maxUses: 0, inviterId: 'u3' } }));
    assert.deepEqual([used.code, used.inviterId], ['new1', 'u3']);
  });

  test('spots a limited invite deleted on its last use', () => {
    const before = invites({ once: { uses: 0, maxUses: 1, inviterId: 'u4' } });
    const used = findUsedInvite(before, invites({}));
    assert.deepEqual([used.code, used.uses, used.inviterId], ['once', 1, 'u4']);
  });

  test('returns null when nothing changed and totals uses per inviter', () => {
    const same = invites({ abc: { uses: 2, maxUses: 0, inviterId: 'u1' }, xyz: { uses: 3, maxUses: 0, inviterId: 'u1' } });
    assert.equal(findUsedInvite(same, same), null);
    assert.equal(countInvitesBy(same, 'u1'), 5);
  });
});

describe('games', () => {
  test('xo finds rows, columns, diagonals and draws', () => {
    assert.equal(findWinner(['X', 'X', 'X', null, 'O', 'O', null, null, null]), 'X');
    assert.equal(findWinner(['O', 'X', null, 'O', 'X', null, 'O', null, null]), 'O');
    assert.equal(findWinner(['X', 'O', null, 'O', 'X', null, null, null, 'X']), 'X');
    assert.equal(findWinner(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X']), 'draw');
    assert.equal(findWinner(Array(9).fill(null)), null);
  });

  test('rps rules', () => {
    assert.equal(decide('rock', 'scissors'), 'win');
    assert.equal(decide('rock', 'paper'), 'lose');
    assert.equal(decide('paper', 'paper'), 'draw');
  });

  test('only the invited member can accept, and the challenger can take the invite back', () => {
    assert.equal(INVITE_MS, 20_000);
    assert.equal(inviteAnswer('invite_accept', 'o', 'c', 'o'), 'accept');
    assert.equal(inviteAnswer('invite_decline', 'o', 'c', 'o'), 'decline');
    assert.equal(inviteAnswer('invite_decline', 'c', 'c', 'o'), 'cancel');
    assert.equal(inviteAnswer('invite_accept', 'c', 'c', 'o'), null, 'the challenger cannot accept for them');
    assert.equal(inviteAnswer('invite_accept', 'x', 'c', 'o'), null, 'someone else cannot accept');
  });
});
