import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CHUNK_SIZE = 1800;

/**
 * OWASP M9 Compliance: Secure Credential Storage Adapter
 * Automatically chunks large JWT sessions across hardware-backed Android Keystore / iOS Keychain
 * to bypass the 2048-byte Android SharedPreferences limitation safely.
 * Includes seamless migration from legacy unencrypted AsyncStorage sessions.
 */
export const LargeSecureStore = {
  async getItem(key: string): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
      }

      const countStr = await SecureStore.getItemAsync(`${key}_chunks`);
      if (!countStr) {
        const directVal = await SecureStore.getItemAsync(key);
        if (directVal) return directVal;

        // One-time legacy migration from unencrypted AsyncStorage
        const legacyVal = await AsyncStorage.getItem(key);
        if (legacyVal) {
          await LargeSecureStore.setItem(key, legacyVal);
          await AsyncStorage.removeItem(key);
          return legacyVal;
        }
        return null;
      }

      const count = parseInt(countStr, 10);
      let fullValue = '';
      for (let i = 0; i < count; i++) {
        const chunk = await SecureStore.getItemAsync(`${key}_chunk_${i}`);
        if (!chunk) return null;
        fullValue += chunk;
      }
      return fullValue;
    } catch (e) {
      if (__DEV__) console.warn('SecureStore getItem error:', e);
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(key, value);
        }
        return;
      }

      await LargeSecureStore.removeItem(key);

      const chunks: string[] = [];
      for (let i = 0; i < value.length; i += CHUNK_SIZE) {
        chunks.push(value.slice(i, i + CHUNK_SIZE));
      }

      await SecureStore.setItemAsync(`${key}_chunks`, chunks.length.toString());
      for (let i = 0; i < chunks.length; i++) {
        await SecureStore.setItemAsync(`${key}_chunk_${i}`, chunks[i]);
      }
    } catch (e) {
      if (__DEV__) console.warn('SecureStore setItem error:', e);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(key);
        }
        return;
      }

      const countStr = await SecureStore.getItemAsync(`${key}_chunks`);
      const count = countStr ? parseInt(countStr, 10) : 0;
      const totalToDelete = Math.max(isNaN(count) ? 0 : count, 30);
      for (let i = 0; i < totalToDelete; i++) {
        try {
          await SecureStore.deleteItemAsync(`${key}_chunk_${i}`);
        } catch {}
      }
      try {
        await SecureStore.deleteItemAsync(`${key}_chunks`);
      } catch {}
      try {
        await SecureStore.deleteItemAsync(key);
      } catch {}
      try {
        await AsyncStorage.removeItem(key);
      } catch {}
    } catch (e) {
      if (__DEV__) console.warn('SecureStore removeItem error:', e);
    }
  },
};
