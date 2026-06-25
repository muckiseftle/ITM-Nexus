import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { space } from '@nexus/ui-kit';
import { Icon, type IconName } from './Icon';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

const PAD = 6; // Innen-Padding der Insel — definiert den Abstand der Pille zur Außenkante.

interface TabDef<K extends string> {
  readonly key: K;
  readonly label: string;
  readonly icon: IconName;
}

interface Props<K extends string> {
  readonly tabs: readonly TabDef<K>[];
  readonly active: K;
  readonly onSelect: (key: K) => void;
}

/**
 * Schwebende „Insel"-Tab-Leiste im Apple-Stil: abgerundete, erhöhte Kapsel mit Schatten; eine
 * markenfarbene Pille gleitet per Feder-Animation hinter den aktiven Tab. Bewegung läuft über den
 * nativen Treiber (Transform/Scale) — der Tint-Wechsel ist zustandsgesteuert (sofort). Bleibt im
 * Layout-Fluss am unteren Rand (keine Überlappung mit dem Inhalt). Ohne externe Animations-Libs.
 */
export function TabBar<K extends string>({ tabs, active, onSelect }: Props<K>): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.key === active),
  );
  const pos = useRef(new Animated.Value(activeIndex)).current;
  const [width, setWidth] = useState(0);

  // Pille zum aktiven Tab federn — auch bei programmatischem Wechsel (z. B. Reset nach Logout).
  useEffect(() => {
    Animated.spring(pos, {
      toValue: activeIndex,
      useNativeDriver: true,
      friction: 9,
      tension: 90,
    }).start();
  }, [activeIndex, pos]);

  const onLayout = (e: LayoutChangeEvent): void => {
    setWidth(e.nativeEvent.layout.width);
  };

  const n = tabs.length;
  const segment = width > 0 ? (width - 2 * PAD) / n : 0;
  const indexRange = tabs.map((_, i) => i);
  const pillX = pos.interpolate({
    inputRange: indexRange.length > 1 ? indexRange : [0, 1],
    outputRange: indexRange.length > 1 ? indexRange.map((i) => i * segment) : [0, 0],
  });

  return (
    <View style={s.wrap}>
      <View style={s.island} onLayout={onLayout}>
        {width > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[s.pill, { width: segment, transform: [{ translateX: pillX }] }]}
          />
        ) : null}
        {tabs.map((tab, i) => {
          const isActive = tab.key === active;
          const tint = isActive ? t.c.brandPrimary : t.c.textSecondary;
          // Aktiver Tab „poppt" dezent (Skalierung folgt der gleitenden Pille, nativer Treiber).
          const scale = pos.interpolate({
            inputRange: [i - 1, i, i + 1],
            outputRange: [1, 1.08, 1],
            extrapolate: 'clamp',
          });
          return (
            <Pressable
              key={tab.key}
              style={s.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
              onPress={() => onSelect(tab.key)}
            >
              <Animated.View style={[s.tabInner, { transform: [{ scale }] }]}>
                <Icon name={tab.icon} size={24} color={tint} />
                <Text style={[s.label, { color: tint }, isActive ? s.labelActive : null]}>
                  {tab.label}
                </Text>
              </Animated.View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    island: {
      // WICHTIG: nur borderRadius + backgroundColor (wie die bewährten Karten). KEIN Rahmen
      // und KEIN Schatten: beide zwingen RN (New Architecture) auf iOS 26, die abgerundete
      // Fläche per UIGraphicsImageRenderer/RCTGetBorderImage zu rasterisieren — das stürzt
      // beim ersten Mount ab (CoreGraphics aa_render/ColorSync, SIGSEGV). Reiner cornerRadius
      // ist sicher. Der „schwebende" Eindruck entsteht über Rundung + Ränder + erhöhte Fläche.
      alignItems: 'center',
      backgroundColor: t.c.bgElevated,
      borderRadius: 28,
      flexDirection: 'row',
      height: 62,
      paddingHorizontal: PAD,
      paddingVertical: PAD,
    },
    label: { fontSize: 11, fontWeight: '500', letterSpacing: 0.2, marginTop: 3 },
    labelActive: { fontWeight: '700' },
    pill: {
      backgroundColor: t.c.brandPrimary + '22',
      borderRadius: 22,
      bottom: PAD,
      left: PAD,
      position: 'absolute',
      top: PAD,
    },
    tab: { alignItems: 'center', flex: 1, justifyContent: 'center' },
    tabInner: { alignItems: 'center', justifyContent: 'center' },
    wrap: { paddingHorizontal: space.md, paddingBottom: space.xs, paddingTop: space.xxs },
  });
}
