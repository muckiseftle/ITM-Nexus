/**
 * Design-Tokens (Single Source of Truth). Plattformunabhängige, typisierte Konstanten aus
 * dem Design-System (siehe docs/05-UX-und-Design.md). Die RN-Komponentenbibliothek
 * konsumiert diese Tokens; sie folgt, sobald die RN-Toolchain verfügbar ist.
 */

export const color = {
  brandPrimary: '#2563EB',
  brandPrimaryDark: '#1D4ED8',
  accent: '#0EA5E9',
  success: '#16A34A',
  warning: '#D97706',
  danger: '#DC2626',
  bgCanvas: '#FFFFFF',
  bgCanvasDark: '#0B0F14',
  bgElevated: '#F7F8FA',
  bgElevatedDark: '#131A22',
  textPrimary: '#0B0F14',
  textPrimaryDark: '#E6EAF0',
  textSecondary: '#5B6573',
  textSecondaryDark: '#9AA5B1',
} as const;

/** 4-pt-Raster. */
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  title: { size: 28, weight: '700', lineHeight: 34 },
  headline: { size: 20, weight: '600', lineHeight: 26 },
  body: { size: 16, weight: '400', lineHeight: 22 },
  caption: { size: 13, weight: '400', lineHeight: 18 },
} as const;

export type ColorToken = keyof typeof color;
export type SpaceToken = keyof typeof space;
export type RadiusToken = keyof typeof radius;
export type TypographyToken = keyof typeof typography;
