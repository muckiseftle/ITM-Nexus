import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { paletteColor, useTheme } from '../theme/ThemeContext';

interface Props {
  /** Anzeigename (für die Initialen). */
  readonly name: string;
  /** Stabiler Farbschlüssel (z. B. E-Mail-Adresse). Fällt auf `name` zurück. */
  readonly colorKey?: string;
  readonly size?: number;
}

/** Bis zu zwei Initialen aus einem Namen bzw. den ersten Zeichen vor dem @. */
function initials(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return '?';
  const local = trimmed.includes('@') ? (trimmed.split('@')[0] ?? trimmed) : trimmed;
  const parts = local.split(/[\s._-]+/).filter((p) => p.length > 0);
  if (parts.length === 0) return local.slice(0, 2).toUpperCase();
  if (parts.length === 1) return (parts[0] ?? '?').slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

/**
 * Farbiger Absender-/Kontakt-Avatar mit Initialen. Die Farbe ist stabil aus `colorKey`
 * (z. B. E-Mail) abgeleitet — gleicher Absender ⇒ immer gleiche Farbe. Weißer Text.
 */
export function Avatar({ name, colorKey, size = 44 }: Props): React.JSX.Element {
  const t = useTheme();
  const bg = useMemo(
    () => paletteColor(t.avatarPalette, (colorKey ?? name).toLowerCase()),
    [t.avatarPalette, colorKey, name],
  );
  return (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
      ]}
    >
      <Text style={[styles.text, { fontSize: size * 0.38 }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  text: { color: '#FFFFFF', fontWeight: '700' },
});
