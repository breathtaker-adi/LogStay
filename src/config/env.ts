// src/config/env.ts
// Centralized Environment & App Configuration
// Separates environment secrets, cloud URLs, and operational defaults from code.

export const ENV = {
  // Supabase Cloud Configuration
  SUPABASE_URL:
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    'https://cmevtjqnztsisldaoghr.supabase.co',

  SUPABASE_ANON_KEY:
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtZXZ0anFuenRzaXNsZGFvZ2hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMDQ2MjMsImV4cCI6MjEwNjY4MDYyM30.6zwBUNXPSFK0g8K-byP9HJa4ZpaQB_YFJLnvuLqRoxM',

  // App Metadata & Routing
  APP_NAME: 'LogStay',
  APP_VERSION: '1.0.0',
  APP_SCHEME: 'logstay',
  UNIVERSAL_LINK_BASE: 'https://logstay.app',

  // Operational Defaults
  INVITE_CODE_VALIDITY_HOURS: 48,
  AUTO_SYNC_INTERVAL_MS: 30000,
  SESSION_STORAGE_KEY: 'sb-cmevtjqnztsisldaoghr-auth-token',
  BG_IMAGE_STORAGE_KEY: 'logstay_custom_bg_banner',
} as const;

export type AppEnvironment = typeof ENV;

