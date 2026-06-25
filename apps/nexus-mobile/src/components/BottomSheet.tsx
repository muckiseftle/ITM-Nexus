import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, space, typography } from '@nexus/ui-kit';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface BottomSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly title?: string;
  readonly children: ReactNode;
}

/**
 * Insel-Bottom-Sheet im Apple-Stil: gleitet von unten herein (Feder-/Timing-Animation), mit
 * abgerundeter Oberkante, „Grabber"-Pille und abgedunkeltem Scrim. Bleibt während der
 * Schließen-Animation gemountet (verzögertes Unmount), damit das Sheet sauch hinausgleitet.
 * Ohne externe Libs — nur RN-`Animated` (nativer Treiber für Transform/Opacity).
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
}: BottomSheetProps): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const anim = useRef(new Animated.Value(0)).current; // 0 = versteckt, 1 = sichtbar
  const [rendered, setRendered] = useState(visible);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      Animated.spring(anim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 11,
        tension: 80,
      }).start();
    } else {
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) setRendered(false);
        },
      );
    }
  }, [visible, anim]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [600, 0] });
  const scrimOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <Modal visible={rendered} transparent animationType="none" onRequestClose={onClose}>
      <View style={s.fill}>
        <Animated.View style={[s.scrim, { opacity: scrimOpacity }]}>
          <Pressable style={s.fill} onPress={onClose} />
        </Animated.View>
        <Animated.View style={[s.sheet, { transform: [{ translateY }] }]}>
          <View style={s.grabber} />
          {title !== undefined ? <Text style={s.title}>{title}</Text> : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

export interface SheetOption {
  readonly key: string;
  readonly label: string;
  readonly sub?: string;
}

interface OptionSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly title?: string;
  readonly options: readonly SheetOption[];
  readonly selected: string;
  readonly onSelect: (key: string) => void;
}

/** Einfach-Auswahl im Insel-Sheet: aktive Option als gefüllte Marken-Pille mit Häkchen. */
export function OptionSheet({
  visible,
  onClose,
  title,
  options,
  selected,
  onSelect,
}: OptionSheetProps): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      {options.map((o) => {
        const active = o.key === selected;
        return (
          <Pressable
            key={o.key}
            style={[s.opt, active ? s.optActive : null]}
            onPress={() => {
              onSelect(o.key);
              onClose();
            }}
          >
            <View style={s.optBody}>
              <Text style={[s.optLabel, active ? s.optLabelActive : null]}>{o.label}</Text>
              {o.sub !== undefined ? <Text style={s.optSub}>{o.sub}</Text> : null}
            </View>
            {active ? <Text style={s.check}>✓</Text> : null}
          </Pressable>
        );
      })}
    </BottomSheet>
  );
}

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    check: { color: t.c.brandPrimary, fontSize: typography.headline.size, fontWeight: '700' },
    fill: { flex: 1 },
    grabber: {
      alignSelf: 'center',
      backgroundColor: t.c.textSecondary,
      borderRadius: radius.pill,
      height: 5,
      marginBottom: space.sm,
      opacity: 0.4,
      width: 40,
    },
    opt: {
      alignItems: 'center',
      borderRadius: radius.pill,
      flexDirection: 'row',
      gap: space.sm,
      marginBottom: space.xxs,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
    },
    optActive: { backgroundColor: t.c.brandPrimary + '1A' },
    optBody: { flex: 1, minWidth: 0 },
    optLabel: { color: t.c.textPrimary, fontSize: typography.body.size },
    optLabelActive: { color: t.c.brandPrimary, fontWeight: '700' },
    optSub: { color: t.c.textSecondary, fontSize: typography.caption.size, marginTop: 2 },
    scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: '#00000066' },
    sheet: {
      backgroundColor: t.c.bgCanvas,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      bottom: 0,
      left: 0,
      paddingBottom: space.xl,
      paddingHorizontal: space.md,
      paddingTop: space.sm,
      position: 'absolute',
      right: 0,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.18,
      shadowRadius: 20,
    },
    title: {
      color: t.c.textPrimary,
      fontSize: typography.headline.size,
      fontWeight: '700',
      marginBottom: space.sm,
      paddingHorizontal: space.xxs,
    },
  });
}
