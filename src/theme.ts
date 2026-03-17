// SoarX Voice — Premium Dark Design System
// High-contrast dark theme optimized for outdoor readability

export const colors = {
  // Primary — sky blue, aviation feel
  primary: '#0EA5E9',
  primaryDark: '#0284C7',
  primaryLight: 'rgba(14, 165, 233, 0.12)',
  primaryBorder: 'rgba(14, 165, 233, 0.25)',
  primaryGlow: 'rgba(14, 165, 233, 0.40)',

  // Backgrounds
  bg: '#0F172A',
  bgCard: '#1E293B',
  bgCardActive: '#334155',
  bgInput: '#1E293B',

  // Semantic
  green: '#22C55E',
  greenLight: 'rgba(34, 197, 94, 0.15)',
  red: '#EF4444',
  redLight: 'rgba(239, 68, 68, 0.12)',
  redGlow: 'rgba(239, 68, 68, 0.40)',
  amber: '#F59E0B',

  // Text
  white: '#F8FAFC',
  text: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  textDim: '#475569',

  // Legacy aliases (for backward compat)
  navy: '#0F172A',
  cyan: '#0EA5E9',
  cyanDark: '#0284C7',
  cyanLight: 'rgba(14, 165, 233, 0.12)',
  cyanBorder: 'rgba(14, 165, 233, 0.25)',
  backgroundTop: '#0F172A',
  backgroundBottom: '#1E293B',
  grey: '#64748B',
  textTertiary: '#475569',
} as const;

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
