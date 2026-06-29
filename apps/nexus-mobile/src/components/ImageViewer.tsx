import React from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { space, typography } from '@nexus/ui-kit';
import { Icon } from './Icon';

interface Props {
  readonly visible: boolean;
  readonly name: string;
  /** Data-URI des Bildes (`data:<type>;base64,…`). `null` = wird noch geladen. */
  readonly uri: string | null;
  readonly onClose: () => void;
  /** Optional: System-Teilen/Speichern (öffnet das native Teilen-Blatt). */
  readonly onShare?: () => void;
}

/**
 * Vollbild-Bildbetrachter direkt in der App (kein externes Programm nötig): zeigt ein als
 * Data-URI geladenes Bild auf dunklem Grund, passend skaliert. Schließen oben links, optionales
 * Teilen/Speichern oben rechts.
 */
export function ImageViewer({ visible, name, uri, onClose, onShare }: Props): React.JSX.Element {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.root}>
        <View style={styles.bar}>
          <Pressable hitSlop={10} onPress={onClose} style={styles.barBtn}>
            <Icon name="x" size={24} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {onShare !== undefined ? (
            <Pressable hitSlop={10} onPress={onShare} style={styles.barBtn}>
              <Icon name="share" size={22} color="#FFFFFF" />
            </Pressable>
          ) : (
            <View style={styles.barBtn} />
          )}
        </View>
        <View style={styles.body}>
          {uri === null ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Image source={{ uri }} style={styles.image} resizeMode="contain" />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  barBtn: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  body: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  image: { height: '100%', width: '100%' },
  name: {
    color: '#FFFFFF',
    flex: 1,
    fontSize: typography.body.size,
    fontWeight: '600',
    textAlign: 'center',
  },
  root: { backgroundColor: '#000000', flex: 1 },
});
