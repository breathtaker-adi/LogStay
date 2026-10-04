import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Paste your Supabase URL and Anon Key here
const supabaseUrl = 'https://cmevtjqnztsisldaoghr.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtZXZ0anFuenRzaXNsZGFvZ2hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMDQ2MjMsImV4cCI6MjEwNjY4MDYyM30.6zwBUNXPSFK0g8K-byP9HJa4ZpaQB_YFJLnvuLqRoxM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});