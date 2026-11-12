/**
 * LogStay Design System Tokens
 *
 * Crisp Apple HIG neutral slate canvas (#FAFAF9), pure white cards (#FFFFFF),
 * Slate borders (#E2E8F0) & inks (#0F172A), Apple Blue accent (#1A56DB / #4F8EF7),
 * combined with high-clarity botanical sage / terracotta / ochre / pewter status semantics
 * and architectural room matrix tiles.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    // ── Surfaces ──────────────────────────────────────────────────────
    bg: '#FAFAF9',
    background: '#FAFAF9',
    surface: '#FFFFFF',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#F2F2F7',
    backgroundSubtle: '#F1F5F9',
    surfaceSubtle: '#F1F5F9',

    // ── Hairlines & Borders ───────────────────────────────────────────
    border: '#E2E8F0',
    borderSubtle: '#F1F5F9',
    separator: '#E2E8F0',
    overlay: 'rgba(0,0,0,0.45)',

    // ── Typography Hierarchy ──────────────────────────────────────────
    text: '#0F172A',
    textSecondary: '#5E6773',
    textTertiary: '#94A3B8',

    // ── Brand / Accent ────────────────────────────────────────────────
    accent: '#1A56DB',
    accentText: '#1A56DB',
    accentSubtle: '#EFF6FF',

    // ── Status Semantics (Free / Occupied / Dirty / Maintenance — Preserved) ─
    free: '#3A5A3E',
    freeSubtle: '#E7ECE7',
    occupied: '#9A3B1E',
    occupiedSubtle: '#F6E2D9',
    dirty: '#7B5624',
    dirtySubtle: '#F5EFE4',
    maintenance: '#3F3F46',
    maintenanceSubtle: '#E5E4E2',
    destructive: '#DC2626',
    destructiveSubtle: '#FEE2E2',

    // ── Architectural Room Matrix Tiles ─────────────────────────────────
    roomCleanBg: '#E7ECE7',
    roomCleanBorder: '#C8D3C9',
    roomCleanFg: '#3A5A3E',
    roomOccupiedBg: '#F6E2D9',
    roomOccupiedBorder: '#E2B49F',
    roomOccupiedFg: '#9A3B1E',
    roomOccupiedDot: '#D9532F',
    roomDirtyBg: '#F5EFE4',
    roomDirtyBorder: '#DFD3BC',
    roomDirtyFg: '#7B5624',
    roomMaintBg: '#D7D7D8',
    roomMaintBorder: '#BCBCBE',
    roomMaintFg: '#3F3F46',
    roomEyebrow: '#64748B',
    roomHairline: '#E2E8F0',
  },
  dark: {
    // ── Surfaces ──────────────────────────────────────────────────────
    bg: '#0C0C0E',
    background: '#0C0C0E',
    surface: '#1C1C1E',
    backgroundElement: '#1C1C1E',
    backgroundSelected: '#2C2C2E',
    backgroundSubtle: '#3A3A3C',
    surfaceSubtle: '#3A3A3C',

    // ── Hairlines & Borders ───────────────────────────────────────────
    border: '#3A3A3C',
    borderSubtle: '#2C2C2E',
    separator: '#3A3A3C',
    overlay: 'rgba(0,0,0,0.6)',

    // ── Typography Hierarchy ──────────────────────────────────────────
    text: '#F5F5F7',
    textSecondary: '#A1A1AA',
    textTertiary: '#636366',

    // ── Brand / Accent ────────────────────────────────────────────────
    accent: '#4F8EF7',
    accentText: '#4F8EF7',
    accentSubtle: '#1E3A5F',

    // ── Status Semantics (Free / Occupied / Dirty / Maintenance — Preserved) ─
    free: '#84BA8A',
    freeSubtle: '#1E2D20',
    occupied: '#E38564',
    occupiedSubtle: '#341F19',
    dirty: '#E3BA78',
    dirtySubtle: '#2F261A',
    maintenance: '#C4BDBA',
    maintenanceSubtle: '#292624',
    destructive: '#F87171',
    destructiveSubtle: '#450A0A',

    // ── Architectural Room Matrix Tiles ─────────────────────────────────
    roomCleanBg: '#1E2B20',
    roomCleanBorder: '#334B36',
    roomCleanFg: '#9AC99F',
    roomOccupiedBg: '#352019',
    roomOccupiedBorder: '#663729',
    roomOccupiedFg: '#F09679',
    roomOccupiedDot: '#FF7A59',
    roomDirtyBg: '#30261A',
    roomDirtyBorder: '#5C4931',
    roomDirtyFg: '#E3BA78',
    roomMaintBg: '#2B2928',
    roomMaintBorder: '#4A4644',
    roomMaintFg: '#C4BDBA',
    roomEyebrow: '#A1A1AA',
    roomHairline: '#3A3A3C',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
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
