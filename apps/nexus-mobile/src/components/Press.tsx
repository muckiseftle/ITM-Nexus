import React from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SPRING = { damping: 18, stiffness: 320, mass: 0.6 };

interface Props {
  readonly children: React.ReactNode;
  readonly onPress?: () => void;
  readonly onLongPress?: () => void;
  readonly style?: StyleProp<ViewStyle>;
  readonly disabled?: boolean;
  /** Skalierung im gedrückten Zustand (Standard 0.97). */
  readonly activeScale?: number;
}

/**
 * Tippbarer Container mit weichem „Press-Scale" (reanimated-Spring) — gibt jeder Zeile/jedem
 * Button ein tastbares, modernes Feedback. Ersetzt das harte Opacity-Flackern.
 */
export function Press({
  children,
  onPress,
  onLongPress,
  style,
  disabled,
  activeScale = 0.97,
}: Props): React.JSX.Element {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      onPressIn={() => {
        scale.value = withSpring(activeScale, SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, SPRING);
      }}
      style={[style, animStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
