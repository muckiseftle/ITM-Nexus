import React, { useEffect } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  readonly children: React.ReactNode;
  /**
   * `push` = Eintritt von rechts + Einblenden (Detail-/Verfassen-Routen).
   * `fade` = nur sanftes Einblenden (Stamm-/Listenansicht, wirkt „darunterliegend").
   */
  readonly mode?: 'push' | 'fade';
  /**
   * Wird beim Zurück-Wischen vom linken Rand aufgerufen. Ohne diesen Wert ist die Geste
   * deaktiviert (z. B. Listenansicht, die keinen Rücksprung hat).
   */
  readonly onBack?: () => void;
}

const EDGE = 28; // Breite des aktiven Rand-Bereichs für die Zurück-Wisch-Geste
const THRESHOLD = 90; // ab dieser Wisch-Distanz gilt die Geste als „Zurück"

/**
 * Routen-Container für die state-getriebene Mail-Navigation (ohne react-navigation): animiert
 * den Eintritt (Slide-from-right + Fade bzw. nur Fade) und erlaubt bei `onBack` das
 * Zurück-Wischen vom linken Rand (gesture-handler). „Calm & Airy": weiche `withTiming`-Kurve.
 */
export function Screen({ children, mode = 'push', onBack }: Props): React.JSX.Element {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const offset = mode === 'push' ? Math.round(width * 0.18) : 0;

  const tx = useSharedValue(offset);
  const opacity = useSharedValue(0);
  const fromEdge = useSharedValue(false);

  useEffect(() => {
    tx.value = withTiming(0, {
      duration: t.motion.duration.base,
      easing: Easing.out(Easing.cubic),
    });
    opacity.value = withTiming(1, { duration: t.motion.duration.base });
    // Nur beim Mounten einspielen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pan = Gesture.Pan()
    .enabled(onBack !== undefined)
    .activeOffsetX(14)
    .failOffsetY([-16, 16])
    .onBegin((e) => {
      fromEdge.value = e.x <= EDGE;
    })
    .onUpdate((e) => {
      if (!fromEdge.value) return;
      const dx = Math.max(0, e.translationX);
      tx.value = dx;
      opacity.value = 1 - Math.min(0.25, dx / width);
    })
    .onEnd((e) => {
      if (fromEdge.value && e.translationX > THRESHOLD) {
        tx.value = withTiming(width, { duration: t.motion.duration.fast }, (done) => {
          if (done && onBack !== undefined) runOnJS(onBack)();
        });
        return;
      }
      tx.value = withTiming(0, { duration: t.motion.duration.base });
      opacity.value = withTiming(1, { duration: t.motion.duration.base });
    });

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: tx.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.fill, style]}>{children}</Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
