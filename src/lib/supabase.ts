import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LargeSecureStore } from './secure-storage';
import { createClient } from '@supabase/supabase-js';

// Paste your Supabase URL and Anon Key here
const supabaseUrl = 'https://cmevtjqnztsisldaoghr.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtZXZ0anFuenRzaXNsZGFvZ2hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMDQ2MjMsImV4cCI6MjEwNjY4MDYyM30.6zwBUNXPSFK0g8K-byP9HJa4ZpaQB_YFJLnvuLqRoxM';

const SUPABASE_AUTH_KEY = 'sb-cmevtjqnztsisldaoghr-auth-token';

// One-time legacy migration from AsyncStorage to LargeSecureStore to avoid logging out existing pilot users
export async function migrateLegacySession() {
  try {
    const legacy = await AsyncStorage.getItem(SUPABASE_AUTH_KEY);
    if (legacy) {
      await LargeSecureStore.setItem(SUPABASE_AUTH_KEY, legacy);
      await AsyncStorage.removeItem(SUPABASE_AUTH_KEY);
    }
  } catch (e) {
    console.warn('Session migration error:', e);
  }
}

// Proactively trigger session migration on launch
void migrateLegacySession();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: LargeSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});