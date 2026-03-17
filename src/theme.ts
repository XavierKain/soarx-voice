// Palette SoarX — thème clair pour usage en extérieur
export const colors = {
  navy: '#1a2744',
  cyan: '#00bcd4',
  cyanDark: '#0097a7',
  cyanLight: 'rgba(0, 188, 212, 0.08)',
  cyanBorder: 'rgba(0, 188, 212, 0.2)',
  backgroundTop: '#eaf4fb',
  backgroundBottom: '#ffffff',
  white: '#ffffff',
  green: '#00C853',
  red: '#e53935',
  redDark: '#c62828',
  grey: '#78909c',
  textSecondary: 'rgba(26, 39, 68, 0.45)',
  textTertiary: 'rgba(26, 39, 68, 0.35)',
} as const;

export const fonts = {
  body: 16,
  input: 17,
  button: 18,
  title: 22,
  logo: 36,
  label: 13,
  small: 12,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 40,
} as const;
