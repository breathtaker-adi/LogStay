import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LargeSecureStore } from './secure-storage';

// In-memory backing stores for mocks
const secureStoreMap = new Map<string, string>();
const asyncStorageMap = new Map<string, string>();

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => secureStoreMap.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, val: string) => {
    secureStoreMap.set(key, val);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    secureStoreMap.delete(key);
  }),
  getItem: vi.fn((key: string) => secureStoreMap.get(key) ?? null),
  setItem: vi.fn((key: string, val: string) => {
    secureStoreMap.set(key, val);
  }),
  deleteItem: vi.fn((key: string) => {
    secureStoreMap.delete(key);
  }),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => asyncStorageMap.get(key) ?? null),
    setItem: vi.fn(async (key: string, val: string) => {
      asyncStorageMap.set(key, val);
    }),
    removeItem: vi.fn(async (key: string) => {
      asyncStorageMap.delete(key);
    }),
  },
}));

vi.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
}));

describe('src/lib/secure-storage.ts', () => {
  beforeEach(() => {
    secureStoreMap.clear();
    asyncStorageMap.clear();
    vi.clearAllMocks();
  });

  it('stores and retrieves a short value with single chunk', async () => {
    const key = 'test_token';
    const value = 'jwt.payload.signature-short';

    await LargeSecureStore.setItem(key, value);
    expect(secureStoreMap.get(`${key}_chunks`)).toBe('1');
    expect(secureStoreMap.get(`${key}_chunk_0`)).toBe(value);

    const retrieved = await LargeSecureStore.getItem(key);
    expect(retrieved).toBe(value);
  });

  it('splits and reassembles values exceeding the 1800 character chunk limit', async () => {
    const key = 'large_session';
    // 4500 characters -> should be 3 chunks (1800 + 1800 + 900)
    const longString = 'A'.repeat(1800) + 'B'.repeat(1800) + 'C'.repeat(900);

    await LargeSecureStore.setItem(key, longString);
    expect(secureStoreMap.get(`${key}_chunks`)).toBe('3');
    expect(secureStoreMap.get(`${key}_chunk_0`)).toBe('A'.repeat(1800));
    expect(secureStoreMap.get(`${key}_chunk_1`)).toBe('B'.repeat(1800));
    expect(secureStoreMap.get(`${key}_chunk_2`)).toBe('C'.repeat(900));

    const retrieved = await LargeSecureStore.getItem(key);
    expect(retrieved).toBe(longString);
    expect(retrieved?.length).toBe(4500);
  });

  it('preserves multi-byte UTF-8 characters (Hindi, emojis) across chunking', async () => {
    const key = 'utf8_data';
    const hindi = 'नमस्ते भारत! यह लॉगस्टे का सुरक्षित स्टोरेज टेस्ट है। 🏨✨🔑🔒';
    const repeatingUtf8 = hindi.repeat(50); // > 1800 chars

    await LargeSecureStore.setItem(key, repeatingUtf8);
    const retrieved = await LargeSecureStore.getItem(key);
    expect(retrieved).toBe(repeatingUtf8);
  });

  it('removeItem clears all chunk keys, count key, and legacy keys', async () => {
    const key = 'temp_token';
    const value = 'X'.repeat(4000); // 3 chunks

    await LargeSecureStore.setItem(key, value);
    expect(secureStoreMap.has(`${key}_chunks`)).toBe(true);
    expect(secureStoreMap.has(`${key}_chunk_0`)).toBe(true);
    expect(secureStoreMap.has(`${key}_chunk_1`)).toBe(true);
    expect(secureStoreMap.has(`${key}_chunk_2`)).toBe(true);

    await LargeSecureStore.removeItem(key);

    expect(secureStoreMap.has(`${key}_chunks`)).toBe(false);
    expect(secureStoreMap.has(`${key}_chunk_0`)).toBe(false);
    expect(secureStoreMap.has(`${key}_chunk_1`)).toBe(false);
    expect(secureStoreMap.has(`${key}_chunk_2`)).toBe(false);
    expect(secureStoreMap.has(key)).toBe(false);
  });

  it('returns null if any chunk is missing or corrupted, preventing partial reads', async () => {
    const key = 'corrupt_test';
    const value = 'Chunk0Data-'.padEnd(1800, '.') + 'Chunk1Data-'.padEnd(1800, '.') + 'Chunk2Data';

    await LargeSecureStore.setItem(key, value);
    expect(secureStoreMap.get(`${key}_chunks`)).toBe('3');

    // Simulate corruption: chunk 1 deleted or dropped
    secureStoreMap.delete(`${key}_chunk_1`);

    const result = await LargeSecureStore.getItem(key);
    expect(result).toBeNull();
  });

  it('migrates legacy unencrypted session from AsyncStorage seamlessly', async () => {
    const key = 'sb-auth-token';
    const legacySession = JSON.stringify({ access_token: 'legacy_jwt_123', user: { id: 'u1' } });

    // Put directly into AsyncStorage (legacy storage)
    asyncStorageMap.set(key, legacySession);

    // Call getItem: it should notice missing SecureStore, read AsyncStorage, save to LargeSecureStore, and wipe AsyncStorage
    const result = await LargeSecureStore.getItem(key);
    expect(result).toBe(legacySession);

    // Check it is now migrated to SecureStore
    expect(secureStoreMap.get(`${key}_chunks`)).toBe('1');
    expect(secureStoreMap.get(`${key}_chunk_0`)).toBe(legacySession);

    // Legacy unencrypted copy must be purged from AsyncStorage
    expect(asyncStorageMap.has(key)).toBe(false);
  });

  it('reads direct unchunked value if present in SecureStore', async () => {
    const key = 'direct_key';
    const directVal = 'simple_direct_value';
    secureStoreMap.set(key, directVal);

    const result = await LargeSecureStore.getItem(key);
    expect(result).toBe(directVal);
  });

  it('returns null when non-existent key is queried', async () => {
    const result = await LargeSecureStore.getItem('non_existent_random_key');
    expect(result).toBeNull();
  });

  it('overwrites previous chunks when setting a shorter value on the same key', async () => {
    const key = 'shrink_key';
    const longVal = 'Z'.repeat(4000); // 3 chunks
    await LargeSecureStore.setItem(key, longVal);
    expect(secureStoreMap.get(`${key}_chunks`)).toBe('3');

    const shortVal = 'short';
    await LargeSecureStore.setItem(key, shortVal);
    expect(secureStoreMap.get(`${key}_chunks`)).toBe('1');
    expect(secureStoreMap.has(`${key}_chunk_1`)).toBe(false);
    expect(secureStoreMap.has(`${key}_chunk_2`)).toBe(false);

    const retrieved = await LargeSecureStore.getItem(key);
    expect(retrieved).toBe(shortVal);
  });

  it('handles empty string properly', async () => {
    const key = 'empty_key';
    await LargeSecureStore.setItem(key, '');
    const retrieved = await LargeSecureStore.getItem(key);
    // Value length 0 produces 0 chunks
    expect(secureStoreMap.get(`${key}_chunks`)).toBe('0');
    expect(retrieved).toBe('');
  });

  it('seeded property test: round-trips random 5000-character diverse strings', async () => {
    // Deterministic pseudo-random sequence
    let seed = 42;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?/`~ हिन्दी 🏨✨';
    let randomStr = '';
    for (let i = 0; i < 5000; i++) {
      const idx = Math.floor(rnd() * charset.length);
      randomStr += charset[idx];
    }

    const key = 'seeded_property_test';
    await LargeSecureStore.setItem(key, randomStr);
    const retrieved = await LargeSecureStore.getItem(key);
    expect(retrieved).toBe(randomStr);
  });
});

