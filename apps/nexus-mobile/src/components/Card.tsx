import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, space } from '@nexus/ui-kit';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  readonly children: React.ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  /** Ohne Innenabstand (z. B. wenn die Karte eine Liste mit eigenen Zeilen umschließt). */
  readonly flush?: boolean;
}

/**
 * Weiche, abgerundete Karten-Fläche („Calm & Airy"). Tiefe über Flächenkontrast + Radius +
 * Weißraum — bewusst KEIN Schatten/Rahmen (iOS-26-Rasterisierungs-Crash bei gerundeten Views).
 */
export function Card({ children, style, flush }: Props): React.JSX.Element {
  const t = useTheme();
  return (
    <View style={[styles.base, { backgroundColor: t.c.card }, flush ? null : styles.padded, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.lg, overflow: 'hidden' },
  padded: { padding: space.md },
});
