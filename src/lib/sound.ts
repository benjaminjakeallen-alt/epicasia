import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

// UI sounds for the native app (web uses sound.web.ts). Short WAVs from
// assets/sounds, generated for this app (not stock samples). Respects the
// iPhone's silent switch and mixes with the user's music instead of
// pausing it.

let initialized = false;
let ticks: AudioPlayer[] = [];
let confirmPlayer: AudioPlayer | null = null;
let nextTick = 0;

export function preloadSounds() {
  if (initialized) return;
  initialized = true;
  setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
  // A small pool so fast swipes can overlap ticks instead of cutting the
  // previous one off mid-sound.
  ticks = [0, 1, 2].map(() => {
    const p = createAudioPlayer(require('../../assets/sounds/tick.wav'));
    p.volume = 0.35;
    return p;
  });
  confirmPlayer = createAudioPlayer(require('../../assets/sounds/confirm.wav'));
  confirmPlayer.volume = 0.4;
}

function replay(p: AudioPlayer | null | undefined) {
  if (!p) return;
  try {
    p.seekTo(0);
    p.play();
  } catch {
    // Sound is a nicety — never let it break navigation.
  }
}

export function playTick() {
  preloadSounds();
  replay(ticks[nextTick++ % ticks.length]);
}

export function playConfirm() {
  preloadSounds();
  replay(confirmPlayer);
}
