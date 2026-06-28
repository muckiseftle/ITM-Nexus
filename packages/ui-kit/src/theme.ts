/**
 * Theme-Auflösung: liefert den passenden Farbsatz für Hell-/Dunkelmodus aus den
 * Design-Tokens (Single Source of Truth in {@link color}). Die RN-App liest das aktuelle
 * `Appearance`-Schema und reicht es hier hinein; die Web-Vorschau nutzt `prefers-color-scheme`.
 */
import { color } from './tokens';

export type ColorScheme = 'light' | 'dark';

export interface ThemeColors {
  readonly brandPrimary: string;
  /** Weiche Marken-Tönung (Füllfläche für aktive/hervorgehobene Zustände, statt Linien). */
  readonly brandSoft: string;
  readonly accent: string;
  readonly success: string;
  readonly warning: string;
  readonly danger: string;
  readonly bgCanvas: string;
  readonly bgElevated: string;
  /** Erhöhte Fläche (Karten) — Tiefe über Kontrast+Radius, KEIN Schatten. */
  readonly bgRaised: string;
  /** Karten-Hintergrund (leicht getönt gegen den Canvas). */
  readonly card: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
}

/** Auflösung des Farbsatzes nach Schema (Dunkel nutzt die `*Dark`-Token-Varianten). */
export function themeColors(scheme: ColorScheme): ThemeColors {
  const dark = scheme === 'dark';
  return {
    brandPrimary: color.brandPrimary,
    brandSoft: dark ? color.brandSoftDark : color.brandSoft,
    accent: color.accent,
    success: color.success,
    warning: color.warning,
    danger: color.danger,
    bgCanvas: dark ? color.bgCanvasDark : color.bgCanvas,
    bgElevated: dark ? color.bgElevatedDark : color.bgElevated,
    bgRaised: dark ? color.bgRaisedDark : color.bgRaised,
    card: dark ? color.cardDark : color.card,
    textPrimary: dark ? color.textPrimaryDark : color.textPrimary,
    textSecondary: dark ? color.textSecondaryDark : color.textSecondary,
  };
}
