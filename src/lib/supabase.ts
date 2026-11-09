import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LargeSecureStore } from './secure-storage';
import { createClient } from '@supabase/supabase-js';
import { ENV } from '@/config/env';

const SUPABASE_AUTH_KEY = ENV.SESSION_STORAGE_KEY;

// One-time legacy migration from AsyncStorage to LargeSecureStore to avoid logging out existing pilot users
export async function migrateLegacySession() {
  try {
    const legacy = await AsyncStorage.getItem(SUPABASE_AUTH_KEY);
    if (legacy) {
      await LargeSecureStore.setItem(SUPABASE_AUTH_KEY, legacy);
      await AsyncStorage.removeItem(SUPABASE_AUTH_KEY);
    }
  } catch (e) {
    if (__DEV__) console.warn('Session migration error:', e);
  }
}

// Proactively trigger session migration on launch
void migrateLegacySession();

export const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
  auth: {
    storage: LargeSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});