// Live transcription while a voice note records, with the browser's own
// speech recognition (Safari/iPhone and Chrome have it; Firefox doesn't).
// Free and on-device or browser-provided — nothing goes to our server.
// Safari ends a recognition session after a pause, so it's restarted until
// stop(). If recognition fails, the recording itself carries on untouched.

export type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
  abort?(): void;
};

/** The browser's speech recognizer (Chromium has it unprefixed, Safari as webkit…). */
export function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function canTranscribe(): boolean {
  return !!recognitionCtor();
}

export type Transcriber = { stop(): string };

/** Starts listening; `onText` gets the transcript so far (final + in progress). */
export function startTranscriber(onText: (text: string) => void): Transcriber | null {
  const C = recognitionCtor();
  if (!C) return null;
  let finished = '';
  let interim = '';
  let running = true;
  let rec: Recognition | null = null;
  let failures = 0;

  const join = () => [finished, interim].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  const open = () => {
    try {
      rec = new C();
      rec.lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e) => {
        interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finished = `${finished} ${r[0].transcript}`.trim();
          else interim += r[0].transcript;
        }
        onText(join());
      };
      rec.onerror = (e) => {
        // Permission refused or no recognizer: give up quietly.
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || ++failures > 5) running = false;
      };
      rec.onend = () => {
        if (interim) finished = `${finished} ${interim}`.trim();
        interim = '';
        if (running) open();
      };
      rec.start();
    } catch {
      running = false;
    }
  };
  open();

  return {
    stop() {
      running = false;
      try {
        rec?.stop();
      } catch {
        // already stopped
      }
      return join();
    },
  };
}
