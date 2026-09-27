import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Set them in the environment (see CLAUDE.md) and restart the dev server ' +
      '— Expo only inlines EXPO_PUBLIC_* vars at process start.',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // PKCE (not the older implicit flow) is the recommended flow for
    // native apps: the recovery/confirmation email link carries an
    // opaque `?code=` param instead of tokens in a URL fragment, which
    // is what src/app/reset-password.tsx expects to receive.
    flowType: 'pkce',
  },
});
