import {
  initializeMusic,
  joinVoiceChannel,
  handlePlay,
  pausePlayback,
  resumePlayback,
  handleSkip,
  handleStop,
  setVolume,
  setLoopMode,
  replyMusicSuccess,
  replyMusicError,
} from './music.js';

export async function shutdownMusic() {
  return true;
}

export async function handleMusicComponent() {
  return false;
}

export {
  initializeMusic,
  joinVoiceChannel,
  handlePlay,
  pausePlayback,
  resumePlayback,
  handleSkip,
  handleStop,
  setVolume,
  setLoopMode,
  replyMusicSuccess,
  replyMusicError,
};

export default {
  initializeMusic,
  shutdownMusic,
  joinVoiceChannel,
  handlePlay,
  pausePlayback,
  resumePlayback,
  handleSkip,
  handleStop,
  setVolume,
  setLoopMode,
  replyMusicSuccess,
  replyMusicError,
  handleMusicComponent,
};
