/**
 * Design tokens for LogStay. All colors referenced in StyleSheet.create must
 * come from these tokens — never hard-code a hex value in a screen file.
 *
 * Usage: const theme = useTheme();  then theme.surface, theme.accent, etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    // ── Surfaces ──────────────────────────────────────────────────────
    /** Page / window background */
    background: '#FAFAF9',
    /** Elevated cards, sheets, drawers */
    backgroundElement: '#FFFFFF',
    /** Grouped sections (inset list backgrounds) */
    backgroundSelected: '#F2F2F7',
    /** Subtle filled element (inputs, secondary buttons) */
    backgroundSubtle: '#F1F5F9',

    // ── Text ──────────────────────────────────────────────────────────
    /** Primary label — #0F172A on #FAFAF9 → 15.3:1 ✓ */
    text: '#0F172A',
    /** Secondary label — #5E6773 on #FAFAF9 → 5.1:1 ✓ */
    textSecondary: '#5E6773',
    /** Tertiary / placeholder */
    textTertiary: '#94A3B8',

    // ── Brand / Accent ─────────────────────────────────────────────────
    /** Primary action, links — 4.6:1 on white ✓ */
    accent: '#1A56DB',
    accentSubtle: '#EFF6FF',

    // ── Status colors (keep consistent across all screens) ─────────────
    free: '#16A34A',
    freeSubtle: '#DCFCE7',
    occupied: '#DC2626',
    occupiedSubtle: '#FEE2E2',
    dirty: '#B45309',
    dirtySubtle: '#FEF9C3',
    maintenance: '#475569',
    maintenanceSubtle: '#F1F5F9',

    // ── UI chrome ─────────────────────────────────────────────────────
    separator: '#E2E8F0',
    overlay: 'rgba(0,0,0,0.45)',

    // ── Convenience Aliases ───────────────────────────────────────────
    bg: '#FAFAF9',
    surface: '#FFFFFF',
    surfaceSubtle: '#F1F5F9',
    border: '#E2E8F0',
    borderSubtle: '#F1F5F9',
    destructive: '#DC2626',
    destructiveSubtle: '#FEE2E2',
  },
  dark: {
    background: '#0C0C0E',
    backgroundElement: '#1C1C1E',
    backgroundSelected: '#2C2C2E',
    backgroundSubtle: '#3A3A3C',

    text: '#F5F5F7',
    textSecondary: '#A1A1AA',
    textTertiary: '#636366',

    accent: '#4F8EF7',
    accentSubtle: '#1E3A5F',

    free: '#34D399',
    freeSubtle: '#064E3B',
    occupied: '#F87171',
    occupiedSubtle: '#450A0A',
    dirty: '#FBBF24',
    dirtySubtle: '#451A03',
    maintenance: '#94A3B8',
    maintenanceSubtle: '#1E293B',

    separator: '#3A3A3C',
    overlay: 'rgba(0,0,0,0.6)',

    // ── Convenience Aliases ───────────────────────────────────────────
    bg: '#0C0C0E',
    surface: '#1C1C1E',
    surfaceSubtle: '#3A3A3C',
    border: '#3A3A3C',
    borderSubtle: '#2C2C2E',
    destructive: '#F87171',
    destructiveSubtle: '#450A0A',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` — San Francisco */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` — New York */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` — SF Pro Rounded */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

