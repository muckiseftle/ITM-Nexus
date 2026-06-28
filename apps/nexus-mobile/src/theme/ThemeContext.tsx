import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import {
  avatarPalette,
  motion,
  themeColors,
  type ColorScheme,
  type ThemeColors,
} from '@nexus/ui-kit';

/**
 * App-Theme: erweitert die plattformunabhängigen {@link ThemeColors} um ein paar von der UI
 * benötigte, abgeleitete Flächen (Trennlinien, gedrückte Zeilen, Text auf Markenfarbe). Das
 * Schema folgt der System-Einstellung (`Appearance`) — exakt wie die Web-Vorschau dem
 * `prefers-color-scheme` folgt.
 */
export interface AppTheme {
  readonly mode: ColorScheme;
  readonly c: ThemeColors;
  /** Trennlinien/Rahmen. */
  readonly border: string;
  /** Hintergrund einer gedrückten Zeile. */
  readonly rowActive: string;
  /** Textfarbe auf Markenfläche (immer weiß). */
  readonly onBrand: string;
  /** Farbpalette für farbige Kalender-Einträge. */
  readonly calPalette: readonly string[];
  /** Avatar-/Label-Farbpalette (stabil je Kennung via {@link paletteColor}). */
  readonly avatarPalette: readonly string[];
  /** Bewegungs-Tokens (Dauern/Easing/Spring) für die Animations-Primitive. */
  readonly motion: typeof motion;
}

function buildTheme(mode: ColorScheme): AppTheme {
  const c = themeColors(mode);
  const dark = mode === 'dark';
  return {
    mode,
    c,
    border: dark ? '#222A33' : '#ECEEF1',
    rowActive: dark ? '#1C232B' : '#EEF1F5',
    onBrand: '#FFFFFF',
    calPalette: [c.brandPrimary, c.accent, c.success, c.warning, c.danger],
    avatarPalette,
    motion,
  };
}

const ThemeContext = createContext<AppTheme>(buildTheme('light'));

export function ThemeProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const scheme = useColorScheme();
  const mode: ColorScheme = scheme === 'dark' ? 'dark' : 'light';
  const value = useMemo(() => buildTheme(mode), [mode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): AppTheme {
  return useContext(ThemeContext);
}

/** Stabile Farbe aus der Palette für eine Kennung (z. B. Termin-/Organisator-Id). */
export function paletteColor(palette: readonly string[], key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  const idx = Math.abs(hash) % palette.length;
  return palette[idx] ?? palette[0] ?? '#2563EB';
}
