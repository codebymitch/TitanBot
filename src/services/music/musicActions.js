import {
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
