import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setIntroSkipped } from './introPrefs';

// "Large & spoken" accessibility mode (phase 1 of CLAUDE.md → accessibility
// mode): a bigger home menu with every label visible, spoken menu items as
// the ring turns (or VoiceOver announcements when VoiceOver is on), and no
// launch intro. Stored on the device, per user of the phone.

export type SpeechRate = 0.8 | 1 | 1.2;

export type A11yMode = {
  /** The mode itself: large menu + spoken items + no intro. */
  enabled: boolean;
  /** Speak menu items aloud as the ring turns (when VoiceOver is off). */
  speak: boolean;
  rate: SpeechRate;
  /** We've already offered the mode once (so the offer card stays dismissed). */
  offered: boolean;
};

const KEY = 'epicasia.a11yMode';
const DEFAULTS: A11yMode = { enabled: false, speak: true, rate: 1, offered: false };

type Ctx = { mode: A11yMode; ready: boolean; update: (patch: Partial<A11yMode>) => void };
const A11yContext = createContext<Ctx>({ mode: DEFAULTS, ready: false, update: () => {} });

export function A11yModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<A11yMode>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) setMode({ ...DEFAULTS, ...JSON.parse(raw) });
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const update = useCallback((patch: Partial<A11yMode>) => {
    setMode((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      if (patch.enabled !== undefined && patch.enabled !== prev.enabled) setIntroSkipped(patch.enabled);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ mode, ready, update }), [mode, ready, update]);
  return <A11yContext.Provider value={value}>{children}</A11yContext.Provider>;
}

export function useA11yMode() {
  return useContext(A11yContext);
}
