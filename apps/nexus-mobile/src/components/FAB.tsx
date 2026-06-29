import React from 'react';
import { StyleSheet, View } from 'react-native';
import { space } from '@nexus/ui-kit';
import { Press } from './Press';
import { Icon, type IconName } from './Icon';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  readonly icon?: IconName;
  readonly onPress: () => void;
}

/**
 * Schwebender Aktions-Button (unten rechts, über der Tableiste). Markenfarbene Scheibe mit
 * weißem Icon und weichem Press-Scale. KEIN Schatten (iOS-26-Rasterisierungs-Crash) — die runde
 * Markenfläche hebt sich allein durch Farbe genug vom Canvas ab.
 */
export function FAB({ icon = 'edit', onPress }: Props): React.JSX.Element {
  const t = useTheme();
  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <Press onPress={onPress} style={[styles.fab, { backgroundColor: t.c.brandPrimary }]}>
        <Icon name={icon} size={26} color={t.onBrand} />
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    alignItems: 'center',
    borderRadius: 30,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  wrap: { bottom: space.lg, position: 'absolute', right: space.lg },
});
