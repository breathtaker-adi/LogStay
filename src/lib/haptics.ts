// src/lib/haptics.ts
// Lightweight Apple HIG haptic feedback helpers with graceful platform fallbacks.

import { Platform } from 'react-native';

type HapticsModule = typeof import('expo-haptics');

function getHaptics(): HapticsModule | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-haptics') as HapticsModule;
  } catch {
    return null;
  }
}

export async function hapticSelection(): Promise<void> {
  const haptics = getHaptics();
  if (!haptics?.selectionAsync) return;
  try {
    await haptics.selectionAsync();
  } catch {
    // Ignore on simulators or devices with haptics disabled
  }
}

export async function hapticImpactLight(): Promise<void> {
  const haptics = getHaptics();
  if (!haptics?.impactAsync) return;
  try {
    await haptics.impactAsync(haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Ignore
  }
}

export async function hapticSuccess(): Promise<void> {
  const haptics = getHaptics();
  if (!haptics?.notificationAsync) return;
  try {
    await haptics.notificationAsync(haptics.NotificationFeedbackType.Success);
  } catch {
    // Ignore
  }
}

export async function hapticWarning(): Promise<void> {
  const haptics = getHaptics();
  if (!haptics?.notificationAsync) return;
  try {
    await haptics.notificationAsync(haptics.NotificationFeedbackType.Warning);
  } catch {
    // Ignore
  }
}

export async function hapticError(): Promise<void> {
  const haptics = getHaptics();
  if (!haptics?.notificationAsync) return;
  try {
    await haptics.notificationAsync(haptics.NotificationFeedbackType.Error);
  } catch {
    // Ignore
  }
}

