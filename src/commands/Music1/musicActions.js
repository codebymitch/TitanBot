export {
  pausePlayback,
  resumePlayback,
  handleSkip,
  handleStop,
  handleQueue,
  seekTrack,
  setVolume,
  setLoopMode,
  setTwentyFourSeven,
  removeFromQueue,
  moveInQueue,
  clearQueue,
  buildNowPlayingReply,
  buildQueueReply,
  replyMusicSuccess,
  replyMusicError,
  handleMusicComponent,
} from './music.js';

import { handlePlay } from './music.js';

export async function playQuery(interaction, query) {
  return handlePlay(interaction, query);
}
