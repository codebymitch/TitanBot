import {
  initializeMusic,
  joinVoiceChannel,
  handlePlay,
  pausePlayback,
  resumePlayback,
  handleSkip,
  handleStop,
  handleQueue,
  setVolume,
  setLoopMode,
  setTwentyFourSeven,
  destroyPlayerSession,
  buildNowPlayingReply,
  replyMusicSuccess,
  replyMusicError,
  handleMusicComponent as engineHandleMusicComponent,
} from './music.js';

export async function shutdownMusic() {
  return true;
}

export async function handleMusicComponent(interaction) {
  return engineHandleMusicComponent(interaction);
}

export async function playQuery(interaction, query) {
  return handlePlay(interaction, query);
}

export {
  initializeMusic,
  joinVoiceChannel,
  handlePlay,
  pausePlayback,
  resumePlayback,
  handleSkip,
  handleStop,
  handleQueue,
  setVolume,
  setLoopMode,
  setTwentyFourSeven,
  destroyPlayerSession,
  buildNowPlayingReply,
  replyMusicSuccess,
  replyMusicError,
};

export default {
  initializeMusic,
  shutdownMusic,
  joinVoiceChannel,
  handlePlay,
  playQuery,
  pausePlayback,
  resumePlayback,
  handleSkip,
  handleStop,
  handleQueue,
  setVolume,
  setLoopMode,
  setTwentyFourSeven,
  destroyPlayerSession,
  buildNowPlayingReply,
  replyMusicSuccess,
  replyMusicError,
  handleMusicComponent,
};
