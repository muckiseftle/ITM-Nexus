import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { space } from '@nexus/ui-kit';
import { Icon, type IconName } from './Icon';
import { useChrome } from './Chrome';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

const PAD = 6; // Innen-Padding der Insel.

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
 * Schwebende Tab-Leiste OHNE Fläche: die Icons stehen frei über einem weichen Verlauf (SVG), der
 * die darunter scrollenden Mails sanft ausblendet (kein Kasten, kein Schatten → iOS-26-sicher).
 * Beim Runterscrollen klappt sie animiert etwas ein (mehr Platz/Lesbarkeit); Hochscrollen oder ein
 * Tab-Tap klappt sie wieder aus. Die markenfarbene Pille gleitet weiterhin hinter den aktiven Tab.
 */
export function TabBar<K extends string>({ tabs, active, onSelect }: Props<K>): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const { collapse, expand } = useChrome();

  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.key === active),
  );
  const pos = useRef(new Animated.Value(activeIndex)).current;
  const [width, setWidth] = useState(0);

  useEffect(() => {
    Animated.spring(pos, {
      toValue: activeIndex,
      useNativeDriver: true,
      friction: 9,
      tension: 90,
    }).start();
  }, [activeIndex, pos]);

  const onLayout = (e: LayoutChangeEvent): void => setWidth(e.nativeEvent.layout.width);

  const n = tabs.length;
  const segment = width > 0 ? (width - 2 * PAD) / n : 0;
  const indexRange = tabs.map((_, i) => i);
  const pillX = pos.interpolate({
    inputRange: indexRange.length > 1 ? indexRange : [0, 1],
    outputRange: indexRange.length > 1 ? indexRange.map((i) => i * segment) : [0, 0],
  });

  // Dynamisches Ein-/Ausklappen: Höhe schrumpft, dezenter Scale, Beschriftungen blenden aus.
  const islandStyle = useAnimatedStyle(() => ({
    height: 62 - 16 * collapse.value,
    transform: [{ scale: 1 - 0.06 * collapse.value }],
  }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: 1 - collapse.value,
    height: 13 * (1 - collapse.value),
    marginTop: 3 * (1 - collapse.value),
  }));

  const press = (key: K): void => {
    expand();
    onSelect(key);
  };

  return (
    <View style={s.wrap} pointerEvents="box-none">
      {/* Weicher Verlauf: transparent → Canvas, blendet scrollende Mails aus (statt harter Fläche). */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="tabfade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.c.bgCanvas} stopOpacity={0} />
            <Stop offset="0.5" stopColor={t.c.bgCanvas} stopOpacity={0.85} />
            <Stop offset="1" stopColor={t.c.bgCanvas} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#tabfade)" />
      </Svg>

      <Reanimated.View style={[s.island, islandStyle]} onLayout={onLayout}>
        {width > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[s.pill, { width: segment, transform: [{ translateX: pillX }] }]}
          />
        ) : null}
        {tabs.map((tab, i) => {
          const isActive = tab.key === active;
          const tint = isActive ? t.c.brandPrimary : t.c.textSecondary;
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
              onPress={() => press(tab.key)}
            >
              <Animated.View style={[s.tabInner, { transform: [{ scale }] }]}>
                <Icon name={tab.icon} size={24} color={tint} />
                <Reanimated.View style={labelStyle}>
                  <Text
                    numberOfLines={1}
                    style={[s.label, { color: tint }, isActive ? s.labelActive : null]}
                  >
                    {tab.label}
                  </Text>
                </Reanimated.View>
              </Animated.View>
            </Pressable>
          );
        })}
      </Reanimated.View>
    </View>
  );
}

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    island: {
      // Bewusst OHNE Fläche/Schatten/Rahmen (nur die Pille als aktiver Indikator). Der „schwebende"
      // Eindruck entsteht über den Verlauf dahinter + Rundung der Pille.
      alignItems: 'center',
      flexDirection: 'row',
      paddingHorizontal: PAD,
      paddingVertical: PAD,
    },
    label: { fontSize: 11, fontWeight: '500', letterSpacing: 0.2 },
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
    wrap: {
      bottom: 0,
      left: 0,
      paddingBottom: space.xs,
      paddingHorizontal: space.md,
      paddingTop: space.xl,
      position: 'absolute',
      right: 0,
    },
  });
}
