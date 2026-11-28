import {
  initializeMusic,
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
  handlePlay,
} from './music.js';

export {
  initializeMusic,
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
};

export async function playQuery(interaction, query) {
  return handlePlay(interaction, query);
}
