import AsyncStorage from '@react-native-async-storage/async-storage';
import { selectionTick } from './haptics';
import { playConfirm } from './sound';
import { recognitionCtor, type Recognition } from './transcribe';
import { askYuki, type YukiTurn } from './yuki';

// Yuki's voice: say "Hey Yuki" (or tap her blossom), ask, and she answers
// out loud. All in the browser — its own speech recognition hears you and
// speechSynthesis speaks; only the question's text goes to the yuki Edge
// Function. One recognizer serves both jobs:
//
//   off ──(wake on)──▶ wake ──"hey yuki…"──▶ listening ──(pause)──▶ thinking
//    ▲                  ▲                        ▲                     │
//    └──────────────────┴──(nothing heard)── follow-up ◀── speaking ◀──┘
//
// "wake" listens for the phrase only while the app is open and in front
// (browsers can't listen in the background), and only if the traveler turned
// it on (a tap starts it, so the mic prompt comes from a gesture). Anything
// else that needs the mic — a journal voice note — claims it with
// claimMic(), which pauses Yuki until it's released. While she speaks the
// recognizer is off, so she never hears herself.

export type YukiState = 'off' | 'wake' | 'listening' | 'thinking' | 'speaking';

export type YukiSnapshot = {
  state: YukiState;
  /** "Listen for Hey Yuki" is on (saved on this phone). */
  wakeOn: boolean;
  /** The browser can't do speech recognition (e.g. Firefox). */
  unsupported: boolean;
  /** Microphone permission was refused. */
  blocked: boolean;
  /** What Yuki heard you say (live while listening). */
  heard: string;
  /** What she's saying (or said last). */
  reply: string;
  /** Listening again after an answer, without the wake phrase. */
  followUp: boolean;
};

const WAKE_KEY = 'epicasia.yukiWake';
// Recognizers spell her name every which way.
const WAKE =
  /\b(?:hey|hi|hay|okay|ok)[\s,.!]+(?:yuki|yuuki|yukie|yukki|yookie|yoki|youki|you key|u key|yuki's)\b[\s,.!?]*/i;
const SILENCE_FINAL_MS = 1200;
const SILENCE_INTERIM_MS = 2200;
const NO_SPEECH_MS = 8000;
const FOLLOW_UP_MS = 6000;
const MAX_LISTEN_MS = 20000;
const FORGET_AFTER_MS = 5 * 60 * 1000;
const KEEP_TURNS = 10;

let snap: YukiSnapshot = {
  state: 'off',
  wakeOn: false,
  unsupported: false,
  blocked: false,
  heard: '',
  reply: '',
  followUp: false,
};
const subscribers = new Set<() => void>();
const pulses = new Set<() => void>();

function set(patch: Partial<YukiSnapshot>) {
  snap = { ...snap, ...patch };
  subscribers.forEach((f) => f());
}

/** For useSyncExternalStore. */
export const yukiStore = {
  subscribe(f: () => void) {
    subscribers.add(f);
    return () => {
      subscribers.delete(f);
    };
  },
  get: () => snap,
};

/** Called on every word Yuki speaks (drives the blossom's glow). */
export function onYukiWord(f: () => void): () => void {
  pulses.add(f);
  return () => {
    pulses.delete(f);
  };
}

// ---------- configuration from the signed-in app ----------

type Config = { name: string; device: () => Promise<Record<string, unknown>> };
let config: Config | null = null;
let history: YukiTurn[] = [];
let lastActive = 0;
let micClaims = 0;
let askToken = 0;

// ---------- recognition ----------

let rec: Recognition | null = null;
let want: 'wake' | 'capture' | null = null;
let failures = 0;
/** Results index where the question starts in the current session. */
let captureIdx = 0;
/** The question starts after a wake phrase inside those results. */
let stripWake = false;
/** Question text carried over from an earlier recognition session. */
let carried = '';
let resultsLen = 0;
let heardAny = false;
let silenceTimer: ReturnType<typeof setTimeout> | null = null;
let noSpeechTimer: ReturnType<typeof setTimeout> | null = null;
let maxTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimers() {
  for (const t of [silenceTimer, noSpeechTimer, maxTimer]) if (t) clearTimeout(t);
  silenceTimer = noSpeechTimer = maxTimer = null;
}

type Results = ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;

function joinResults(results: Results, from: number) {
  let text = '';
  for (let i = from; i < results.length; i++) text += ` ${results[i][0].transcript}`;
  return text.replace(/\s+/g, ' ').trim();
}

function questionFrom(results: Results) {
  let text = joinResults(results, captureIdx);
  if (stripWake) {
    const m = WAKE.exec(text);
    if (m) text = text.slice(m.index + m[0].length);
  }
  return `${carried} ${text}`.replace(/\s+/g, ' ').trim();
}

function startRecognizer() {
  if (rec) return;
  const C = recognitionCtor();
  if (!C) return;
  const r = new C();
  rec = r;
  resultsLen = 0;
  r.lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
  r.continuous = true;
  r.interimResults = true;
  r.onresult = (e) => {
    if (rec !== r) return;
    failures = 0;
    resultsLen = e.results.length;
    if (want === 'wake') {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (WAKE.test(e.results[i][0].transcript)) {
          captureIdx = i;
          stripWake = true;
          carried = '';
          beginListening(false);
          break;
        }
      }
      if (want === 'wake') return;
    }
    if (want !== 'capture') return;
    const text = questionFrom(e.results);
    set({ heard: text });
    if (!text) return;
    heardAny = true;
    if (noSpeechTimer) clearTimeout(noSpeechTimer);
    noSpeechTimer = null;
    if (silenceTimer) clearTimeout(silenceTimer);
    const last = e.results[e.results.length - 1];
    silenceTimer = setTimeout(finishListening, last?.isFinal ? SILENCE_FINAL_MS : SILENCE_INTERIM_MS);
  };
  r.onerror = (e) => {
    if (rec !== r) return;
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      want = null;
      set({ blocked: true });
      if (snap.state === 'listening') {
        clearTimers();
        speak('I can’t use the microphone. Allow it for Epic Asia in your settings, then tap my blossom.', false);
      } else set({ state: 'off' });
    }
  };
  r.onend = () => {
    if (rec !== r) return;
    rec = null;
    resultsLen = 0;
    // A session ends after a pause (Safari) or a network hiccup: keep going.
    if (want === 'capture') {
      carried = snap.heard;
      captureIdx = 0;
      stripWake = false;
    }
    if (want && ++failures < 8) setTimeout(() => want && startRecognizer(), failures > 2 ? 1000 : 150);
    else if (want) idle();
  };
  try {
    r.start();
  } catch {
    rec = null;
  }
}

function stopRecognizer() {
  want = null;
  const r = rec;
  rec = null;
  resultsLen = 0;
  try {
    if (r?.abort) r.abort();
    else r?.stop();
  } catch {
    // already stopped
  }
}

function beginListening(fresh: boolean, followUp = false) {
  clearTimers();
  if (fresh) {
    captureIdx = resultsLen;
    stripWake = false;
    carried = '';
  }
  heardAny = false;
  want = 'capture';
  if (Date.now() - lastActive > FORGET_AFTER_MS) history = [];
  set({ state: 'listening', heard: '', reply: followUp ? snap.reply : '', followUp });
  if (!followUp) {
    playConfirm();
    selectionTick();
  }
  noSpeechTimer = setTimeout(() => !heardAny && idle(), followUp ? FOLLOW_UP_MS : NO_SPEECH_MS);
  maxTimer = setTimeout(finishListening, MAX_LISTEN_MS);
  startRecognizer();
}

function finishListening() {
  clearTimers();
  const question = snap.heard.trim();
  stopRecognizer();
  if (!question) {
    idle();
    return;
  }
  void ask(question);
}

// ---------- asking and speaking ----------

async function ask(question: string) {
  const token = ++askToken;
  lastActive = Date.now();
  set({ state: 'thinking', heard: question, reply: '', followUp: false });
  const turns: YukiTurn[] = [...history, { role: 'user', text: question }];
  try {
    const device = config ? await config.device().catch(() => ({})) : {};
    const { reply } = await askYuki(turns, { name: config?.name ?? '', voice: true, device });
    if (token !== askToken) return;
    history = [...turns, { role: 'assistant' as const, text: reply }].slice(-KEEP_TURNS);
    speak(reply, true);
  } catch (e) {
    if (token !== askToken) return;
    speak((e as Error).message || 'Something went wrong — try again.', false);
  }
}

let voice: SpeechSynthesisVoice | null | undefined;
const PREFERRED =
  /samantha|ava|allison|susan|karen|moira|tessa|serena|victoria|zira|aria|jenny|female|google us english/i;

function pickVoice(): SpeechSynthesisVoice | null {
  if (voice !== undefined) return voice;
  const all = window.speechSynthesis?.getVoices() ?? [];
  if (!all.length) return null; // not loaded yet; try again next time
  const lang = ((typeof navigator !== 'undefined' && navigator.language) || 'en-US').toLowerCase();
  const english = all.filter((v) => v.lang.toLowerCase().startsWith('en'));
  const local = english.filter((v) => v.lang.toLowerCase().replace('_', '-') === lang);
  voice =
    local.find((v) => PREFERRED.test(v.name)) ??
    english.find((v) => PREFERRED.test(v.name)) ??
    local[0] ??
    english[0] ??
    null;
  return voice;
}

let speakTimer: ReturnType<typeof setTimeout> | null = null;

function speak(text: string, followUp: boolean) {
  clearTimers();
  stopRecognizer();
  set({ state: 'speaking', reply: text, followUp: false });
  const done = () => {
    if (speakTimer) clearTimeout(speakTimer);
    speakTimer = null;
    if (snap.state !== 'speaking' || snap.reply !== text) return;
    lastActive = Date.now();
    if (followUp && !snap.unsupported && !snap.blocked && micClaims === 0) beginListening(true, true);
    else idle();
  };
  // Some browsers never fire onend: give up waiting after a generous guess.
  speakTimer = setTimeout(done, 4000 + text.length * 90);
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth) return;
  try {
    synth.cancel();
    const sentences = text.match(/[^.!?。！？]+[.!?。！？]*\s*/g) ?? [text];
    sentences.forEach((s, i) => {
      const u = new SpeechSynthesisUtterance(s.trim());
      const v = pickVoice();
      if (v) {
        u.voice = v;
        u.lang = v.lang;
      }
      u.rate = 1;
      u.pitch = 1.05;
      u.onstart = () => pulses.forEach((f) => f());
      u.onboundary = (e) => {
        if (e.name === undefined || e.name === 'word') pulses.forEach((f) => f());
      };
      if (i === sentences.length - 1) {
        u.onend = done;
        u.onerror = done;
      }
      synth.speak(u);
    });
  } catch {
    // The words are on screen anyway.
  }
}

function silence() {
  if (speakTimer) clearTimeout(speakTimer);
  speakTimer = null;
  try {
    window.speechSynthesis?.cancel();
  } catch {
    // nothing to cancel
  }
}

/** Back to resting: listening for "Hey Yuki" if that's on, else off. */
function idle() {
  clearTimers();
  silence();
  const listen = !!config && snap.wakeOn && !snap.blocked && !snap.unsupported && micClaims === 0 && !hidden();
  if (listen) {
    want = 'wake';
    set({ state: 'wake', followUp: false });
    startRecognizer();
  } else {
    stopRecognizer();
    set({ state: 'off', followUp: false });
  }
}

function hidden() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

// iOS only lets a page speak after it has spoken once inside a tap.
let unlocked = false;
function unlockSpeech() {
  if (unlocked || typeof window === 'undefined' || !window.speechSynthesis) return;
  unlocked = true;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {
    // ignore
  }
}

// ---------- public ----------

/** Starts Yuki for the signed-in traveler; returns a stop for sign-out. */
export function startYukiVoice(c: Config): () => void {
  config = c;
  set({ unsupported: !recognitionCtor() });
  AsyncStorage.getItem(WAKE_KEY)
    .then((v) => {
      set({ wakeOn: v === '1' });
      if (snap.state === 'off' || snap.state === 'wake') idle();
    })
    .catch(() => {});
  const onVisible = () => {
    if (snap.state === 'off' || snap.state === 'wake') idle();
  };
  const onTap = () => unlockSpeech();
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisible);
    document.addEventListener('pointerdown', onTap, { once: true });
  }
  return () => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('pointerdown', onTap);
    }
    config = null;
    history = [];
    askToken++;
    clearTimers();
    silence();
    stopRecognizer();
    set({ state: 'off', heard: '', reply: '', followUp: false });
  };
}

/** Tap-to-talk (the home blossom, or the big one while she's up). */
export function talkToYuki() {
  unlockSpeech();
  if (snap.unsupported) {
    speak('I can’t hear in this browser. Open Epic Asia in Safari or Chrome to talk to me.', false);
    return;
  }
  if (snap.state === 'thinking') return;
  if (snap.state === 'listening' && snap.heard) {
    finishListening(); // tap again = "that's my question"
    return;
  }
  silence();
  if (micClaims > 0) return;
  set({ blocked: false });
  beginListening(true);
}

/** ✕ — stop listening/talking and go back to resting. */
export function stopYuki() {
  askToken++;
  idle();
}

/** "Listen for Hey Yuki" on/off (call from a tap: it may ask for the mic). */
export function setYukiWake(on: boolean) {
  unlockSpeech();
  AsyncStorage.setItem(WAKE_KEY, on ? '1' : '0').catch(() => {});
  set({ wakeOn: on, blocked: false });
  if (snap.state === 'off' || snap.state === 'wake') idle();
}

/** Something else needs the microphone (a voice note): Yuki steps aside until released. */
export function claimMic(): () => void {
  micClaims++;
  askToken++;
  clearTimers();
  silence();
  stopRecognizer();
  set({ state: 'off', followUp: false });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    micClaims = Math.max(0, micClaims - 1);
    if (micClaims === 0) setTimeout(idle, 300);
  };
}
