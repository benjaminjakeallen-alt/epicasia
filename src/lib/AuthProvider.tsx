import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { clearSignIn, sessionExpired } from './rememberMe';
import { supabase } from './supabase';

type AuthContextValue = {
  session: Session | null;
  initializing: boolean;
};

const AuthContext = createContext<AuthContextValue>({ session: null, initializing: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    // Restore the stored session unless its "keep me signed in" window
    // (see rememberMe.ts) has lapsed — then sign out before showing the app.
    supabase.auth.getSession().then(async ({ data }) => {
      let restored = data.session;
      if (restored && (await sessionExpired().catch(() => false))) {
        await supabase.auth.signOut().catch(() => {});
        restored = null;
      }
      setSession(restored);
      setInitializing(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === 'SIGNED_OUT') clearSignIn().catch(() => {});
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={{ session, initializing }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
