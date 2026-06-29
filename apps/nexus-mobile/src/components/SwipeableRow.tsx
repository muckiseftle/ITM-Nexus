import React, { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Icon } from './Icon';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  readonly children: React.ReactNode;
  /** Aktion „Archivieren" (rechte Wischfläche, Markenfarbe). */
  readonly onArchive?: () => void;
  /** Aktion „Löschen" (rechte Wischfläche, Rot). */
  readonly onDelete?: () => void;
  /** Aktion „Als ungelesen markieren" (linke Wischfläche — Wischen von links nach rechts). */
  readonly onMarkUnread?: () => void;
}

/**
 * Zeile mit Wisch-Aktionen (gesture-handler): nach links wischen enthüllt Archivieren/Löschen,
 * nach rechts (von links) wischen markiert als ungelesen. Antippen der Aktionsfläche führt sie
 * aus und schließt die Zeile. Nutzt die bestehenden Mail-Aktionen (archive/remove/setRead).
 */
export function SwipeableRow({
  children,
  onArchive,
  onDelete,
  onMarkUnread,
}: Props): React.JSX.Element {
  const t = useTheme();
  const ref = useRef<SwipeableMethods>(null);
  const run = (fn?: () => void): void => {
    ref.current?.close();
    fn?.();
  };

  const renderLeft = (): React.JSX.Element => (
    <View style={styles.actions}>
      {onMarkUnread !== undefined ? (
        <Pressable
          style={[styles.action, { backgroundColor: t.c.accent }]}
          onPress={() => run(onMarkUnread)}
        >
          <Icon name="mail" size={22} color="#FFFFFF" />
        </Pressable>
      ) : null}
    </View>
  );

  const renderRight = (): React.JSX.Element => (
    <View style={styles.actions}>
      {onArchive !== undefined ? (
        <Pressable
          style={[styles.action, { backgroundColor: t.c.brandPrimary }]}
          onPress={() => run(onArchive)}
        >
          <Icon name="archive" size={22} color={t.onBrand} />
        </Pressable>
      ) : null}
      {onDelete !== undefined ? (
        <Pressable
          style={[styles.action, { backgroundColor: t.c.danger }]}
          onPress={() => run(onDelete)}
        >
          <Icon name="trash" size={22} color="#FFFFFF" />
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      leftThreshold={40}
      rightThreshold={40}
      overshootLeft={false}
      overshootRight={false}
      {...(onMarkUnread !== undefined ? { renderLeftActions: renderLeft } : {})}
      renderRightActions={renderRight}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  action: { alignItems: 'center', justifyContent: 'center', width: 64 },
  actions: { flexDirection: 'row' },
});
