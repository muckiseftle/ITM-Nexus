/**
 * Design-Tokens (Single Source of Truth). Plattformunabhängige, typisierte Konstanten aus
 * dem Design-System (siehe docs/05-UX-und-Design.md). Die RN-Komponentenbibliothek konsumiert
 * diese Tokens.
 *
 * Designsprache „Bold & Dynamic": starke Kontraste, klare Hierarchien und lebendige Akzente.
 * Kräftige Typografie + reduzierte Flächen schaffen Fokus; Indigo (`brand[600]` = #4F46E5) ist
 * die Primärfarbe für Aktionen, Status und aktive Zustände. Tiefe entsteht weiter über
 * Flächenkontrast + Radius + Abstand (NICHT über Schatten/Rahmen auf gerundeten Flächen, die auf
 * iOS 26 + New Architecture abstürzen).
 */

/** Indigo-Leitfarbenrampe (Tailwind-Indigo). `brand[600]` = Markenfarbe. */
export const brand = {
  50: '#EEF2FF',
  100: '#E0E7FF',
  200: '#C7D2FE',
  300: '#A5B4FC',
  400: '#818CF8',
  500: '#6366F1',
  600: '#4F46E5',
  700: '#4338CA',
  800: '#3730A3',
  900: '#312E81',
} as const;

export const color = {
  brandPrimary: brand[600],
  brandPrimaryDark: brand[700],
  /** Sehr helle Marken-Tönung (weiche Füllfläche statt Linien). */
  brandSoft: '#EEF0FE',
  brandSoftDark: '#1C1B33',
  /** Akzent (Violett) — sparsam für Hervorhebungen. */
  accent: '#7C3AED',
  success: '#16A34A',
  warning: '#D97706',
  danger: '#DC2626',
  bgCanvas: '#FFFFFF',
  bgCanvasDark: '#0B0F14',
  bgElevated: '#F5F6FA',
  bgElevatedDark: '#131A22',
  /** Karten/erhöhte Flächen (Tiefe via Kontrast+Radius, kein Schatten). */
  bgRaised: '#FFFFFF',
  bgRaisedDark: '#1A222C',
  card: '#F4F6FB',
  cardDark: '#161E27',
  textPrimary: '#0B0F14',
  textPrimaryDark: '#E6EAF0',
  textSecondary: '#5B6573',
  textSecondaryDark: '#9AA5B1',
} as const;

/** Avatar-/Label-Palette: ruhige, zugängliche Farbtöne (weißer Text darauf lesbar). */
export const avatarPalette = [
  '#6366F1', // indigo
  '#7C3AED', // violet
  '#0EA5E9', // sky
  '#0D9488', // teal
  '#16A34A', // green
  '#CA8A04', // amber
  '#EA580C', // orange
  '#E11D48', // rose
  '#DB2777', // pink
  '#0891B2', // cyan
] as const;

/** 8-pt-Raster (Skala aus dem „Bold & Dynamic"-Design-System). */
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/**
 * Typo-Skala „Bold & Dynamic": kräftige Titel/Headlines für klare Hierarchie, ruhiger Fließtext.
 * `weight` als React-Native-`fontWeight`-String.
 */
export const typography = {
  largeTitle: { size: 34, weight: '800', lineHeight: 41 },
  title: { size: 28, weight: '700', lineHeight: 34 },
  headline: { size: 20, weight: '700', lineHeight: 26 },
  body: { size: 16, weight: '400', lineHeight: 22 },
  caption: { size: 13, weight: '400', lineHeight: 18 },
} as const;

/**
 * Bewegungs-Tokens. `easing` als kubische Bezier-Tupel (für reanimated `Easing.bezier(...)`);
 * `spring` als reanimated-`withSpring`-Konfiguration. `duration` in ms.
 */
export const motion = {
  duration: { fast: 150, base: 220, slow: 320 },
  easing: {
    standard: [0.2, 0, 0, 1],
    decelerate: [0, 0, 0, 1],
    accelerate: [0.3, 0, 1, 1],
  },
  spring: { damping: 18, stiffness: 180, mass: 1 },
} as const;

export type ColorToken = keyof typeof color;
export type SpaceToken = keyof typeof space;
export type RadiusToken = keyof typeof radius;
export type TypographyToken = keyof typeof typography;
export type BrandShade = keyof typeof brand;
