import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HOME_GUILD_ID } from '../src/config/homeGuild.js';
import { retryFailedTrack, retryQuery, failedTrackLine } from '../src/services/music/trackRetry.js';

const track = (identifier, title = 'W lessa Yama', author = 'Ramy Sabry') => ({ info: { identifier, title, author, requester: { id: '1' } } });

function setup(results, guildId = HOME_GUILD_ID) {
  const searches = [];
  const client = {
    riffy: {
      resolve: async ({ query, source }) => {
        searches.push(`${source}:${query}`);
        return results[source] || { loadType: 'empty', tracks: [] };
      },
    },
  };
  const player = { guildId, playing: true, paused: false, queue: [track('next')], played: 0, play: async () => { player.played += 1; } };
  return { client, player, searches };
}

describe('a song that fails is tried again from another source (report #227)', () => {
  test('the first copy found on YouTube is queued next', async () => {
    const copy = track('yt-copy');
    const { client, player, searches } = setup({ ytsearch: { loadType: 'search', tracks: [copy] } });
    assert.equal(await retryFailedTrack(client, player, track('failed')), copy);
    assert.deepEqual(searches, ['ytsearch:W lessa Yama Ramy Sabry']);
    assert.equal(player.queue[0], copy);
    assert.equal(copy.info.retryOf, 'failed');
    assert.equal(player.played, 0);
  });

  test('SoundCloud is tried when YouTube has nothing, and an idle player starts', async () => {
    const copy = track('sc-copy');
    const { client, player, searches } = setup({ scsearch: { loadType: 'search', tracks: [copy] } });
    player.playing = false;
    assert.equal(await retryFailedTrack(client, player, track('failed')), copy);
    assert.equal(searches.length, 2);
    assert.equal(player.played, 1);
  });

  test('the same track, a copy that failed too, and another server are not retried', async () => {
    const same = setup({ ytsearch: { loadType: 'search', tracks: [track('failed')] } });
    assert.equal(await retryFailedTrack(same.client, same.player, track('failed')), null);

    const retried = track('copy');
    retried.info.retryOf = 'failed';
    const again = setup({ ytsearch: { loadType: 'search', tracks: [track('other')] } });
    assert.equal(await retryFailedTrack(again.client, again.player, retried), null);
    assert.equal(again.searches.length, 0);

    const other = setup({ ytsearch: { loadType: 'search', tracks: [track('other')] } }, '300000000000000001');
    assert.equal(await retryFailedTrack(other.client, other.player, track('failed')), null);
    assert.equal(other.searches.length, 0);
  });

  test('query and the skip line', () => {
    assert.equal(retryQuery(track('x', 'Aref Habibi', 'Aref')), 'Aref Habibi');
    assert.match(failedTrackLine(track('x', 'Ragea')), /Ragea.*اتخطت/u);
  });
});
