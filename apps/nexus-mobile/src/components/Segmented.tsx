import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { radius, typography } from '@nexus/ui-kit';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

const PAD = 4;

interface Option<K extends string> {
  readonly key: K;
  readonly label: string;
}

interface Props<K extends string> {
  readonly options: readonly Option<K>[];
  readonly value: K;
  readonly onChange: (key: K) => void;
}

/**
 * Segmentierter Umschalter mit gleitendem Indikator (reanimated). Ruhig: heller „Karten"-Indikator
 * auf getönter Spur, aktive Beschriftung in Markenfarbe.
 */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
}: Props<K>): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const [width, setWidth] = useState(0);

  const n = options.length;
  const idx = Math.max(
    0,
    options.findIndex((o) => o.key === value),
  );
  const seg = width > 0 ? (width - PAD * 2) / n : 0;

  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withTiming(idx * seg, { duration: t.motion.duration.base });
  }, [idx, seg, t.motion.duration.base, x]);
  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  const onLayout = (e: LayoutChangeEvent): void => setWidth(e.nativeEvent.layout.width);

  return (
    <View style={s.track} onLayout={onLayout}>
      {width > 0 ? <Animated.View style={[s.indicator, { width: seg }, indicator]} /> : null}
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable key={o.key} style={s.seg} onPress={() => onChange(o.key)} hitSlop={4}>
            <Text style={[s.label, active ? s.labelActive : null]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    indicator: {
      backgroundColor: t.c.bgRaised,
      borderRadius: radius.pill,
      bottom: PAD,
      left: PAD,
      position: 'absolute',
      top: PAD,
    },
    label: { color: t.c.textSecondary, fontSize: typography.caption.size, fontWeight: '600' },
    labelActive: { color: t.c.brandPrimary, fontWeight: '700' },
    seg: { alignItems: 'center', flex: 1, paddingVertical: 8 },
    track: {
      // Flach/modern: nur eine dezente Schattierung als Spur; der aktive Chip (Indikator) bleibt.
      backgroundColor: t.c.textSecondary + '14',
      borderRadius: radius.pill,
      flexDirection: 'row',
      padding: PAD,
    },
  });
}
