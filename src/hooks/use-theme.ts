/**
 * Returns the correct color token set for the current appearance (light/dark).
 * Usage in any screen: const theme = useTheme();
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme() {
  const scheme = useColorScheme();
  // 'unspecified' can occur briefly on first render — default to light
  const mode: 'light' | 'dark' = scheme === 'dark' ? 'dark' : 'light';
  return Colors[mode];
}
