// SoarX Voice — Dual Theme Design System

const darkColors = {
  primary: '#0EA5E9',
  primaryDark: '#0284C7',
  primaryLight: 'rgba(14, 165, 233, 0.12)',
  primaryBorder: 'rgba(14, 165, 233, 0.25)',
  primaryGlow: 'rgba(14, 165, 233, 0.40)',
  bg: '#0F172A',
  bgCard: '#1E293B',
  bgCardActive: '#334155',
  bgInput: '#1E293B',
  green: '#22C55E',
  greenLight: 'rgba(34, 197, 94, 0.15)',
  red: '#EF4444',
  redLight: 'rgba(239, 68, 68, 0.12)',
  redGlow: 'rgba(239, 68, 68, 0.40)',
  amber: '#F59E0B',
  white: '#F8FAFC',
  text: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  textDim: '#475569',
  cardBorder: 'rgba(255,255,255,0.06)',
  statusBar: 'light-content' as const,
} as const;

const lightColors = {
  primary: '#0EA5E9',
  primaryDark: '#0284C7',
  primaryLight: 'rgba(14, 165, 233, 0.08)',
  primaryBorder: 'rgba(14, 165, 233, 0.20)',
  primaryGlow: 'rgba(14, 165, 233, 0.35)',
  bg: '#F0F4F8',
  bgCard: '#FFFFFF',
  bgCardActive: '#E2E8F0',
  bgInput: '#FFFFFF',
  green: '#22C55E',
  greenLight: 'rgba(34, 197, 94, 0.12)',
  red: '#EF4444',
  redLight: 'rgba(239, 68, 68, 0.08)',
  redGlow: 'rgba(239, 68, 68, 0.30)',
  amber: '#F59E0B',
  white: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  textDim: '#CBD5E1',
  cardBorder: 'rgba(0,0,0,0.08)',
  statusBar: 'dark-content' as const,
} as const;

export type ThemeColors = typeof darkColors;
export type ThemeMode = 'dark' | 'light';

export function getColors(mode: ThemeMode): ThemeColors {
  return mode === 'dark' ? darkColors : lightColors;
}

// Default export for backward compat (dark mode)
export const colors = darkColors;

// Legacy aliases
export const navy = darkColors.bg;
export const cyan = darkColors.primary;

export const fonts = {
  xs: 11,
  sm: 13,
  body: 15,
  input: 16,
  button: 17,
  title: 24,
  heading: 20,
  logo: 38,
  label: 12,
  small: 11,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;
