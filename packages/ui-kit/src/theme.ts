/**
 * Theme-Auflösung: liefert den passenden Farbsatz für Hell-/Dunkelmodus aus den
 * Design-Tokens (Single Source of Truth in {@link color}). Die RN-App liest das aktuelle
 * `Appearance`-Schema und reicht es hier hinein; die Web-Vorschau nutzt `prefers-color-scheme`.
 */
import { color } from './tokens';

export type ColorScheme = 'light' | 'dark';

export interface ThemeColors {
  readonly brandPrimary: string;
  readonly accent: string;
  readonly success: string;
  readonly warning: string;
  readonly danger: string;
  readonly bgCanvas: string;
  readonly bgElevated: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
}

/** Auflösung des Farbsatzes nach Schema (Dunkel nutzt die `*Dark`-Token-Varianten). */
export function themeColors(scheme: ColorScheme): ThemeColors {
  const dark = scheme === 'dark';
  return {
    brandPrimary: color.brandPrimary,
    accent: color.accent,
    success: color.success,
    warning: color.warning,
    danger: color.danger,
    bgCanvas: dark ? color.bgCanvasDark : color.bgCanvas,
    bgElevated: dark ? color.bgElevatedDark : color.bgElevated,
    textPrimary: dark ? color.textPrimaryDark : color.textPrimary,
    textSecondary: dark ? color.textSecondaryDark : color.textSecondary,
  };
}
