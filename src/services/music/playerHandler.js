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

export async function handleMusicComponent() {
  return false;
}

export default {
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
  handleMusicComponent,
};
