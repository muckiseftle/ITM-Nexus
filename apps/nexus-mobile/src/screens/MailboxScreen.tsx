import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { isUnread, toAccountId, toFolderId, type MailMessage, type MessageId } from '@nexus/domain';
import { color, space, typography } from '@nexus/ui-kit';
import type { AppContainer } from '../composition/container';
import { DEMO_ACCOUNT_ID, DEMO_INBOX_ID } from '../config';

interface Props {
  readonly container: AppContainer;
  readonly onOpenMessage: (messageId: MessageId) => void;
}

// Aktives Konto/Ordner. In der echten App aus Konto-Setup/Sidebar; hier aus der Config.
const ACCOUNT = toAccountId(DEMO_ACCOUNT_ID);
const INBOX = toFolderId(DEMO_INBOX_ID);

export function MailboxScreen({ container, onOpenMessage }: Props): React.JSX.Element {
  const [messages, setMessages] = useState<readonly MailMessage[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const items = await container.mailStore.listFolder(ACCOUNT, INBOX, 100, 0);
    setMessages(items);
  }, [container]);

  const sync = useCallback(async () => {
    setRefreshing(true);
    try {
      await container.sync.syncMessages(ACCOUNT, INBOX);
      await container.outbox.drain(ACCOUNT);
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [container, load]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <FlatList
      data={messages}
      keyExtractor={(m) => m.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void sync()} />}
      renderItem={({ item }) => (
        <Pressable
          style={styles.row}
          onPress={() => {
            onOpenMessage(item.id);
          }}
        >
          <View style={[styles.dot, { opacity: isUnread(item) ? 1 : 0 }]} />
          <View style={styles.rowBody}>
            <Text numberOfLines={1} style={styles.sender}>
              {item.from.displayName ?? item.from.address}
            </Text>
            <Text numberOfLines={1} style={styles.subject}>
              {item.subject}
            </Text>
            <Text numberOfLines={1} style={styles.preview}>
              {item.preview}
            </Text>
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    backgroundColor: color.brandPrimary,
    borderRadius: 4,
    height: 8,
    marginRight: space.sm,
    marginTop: space.xs,
    width: 8,
  },
  preview: { color: color.textSecondary, fontSize: typography.caption.size },
  row: { flexDirection: 'row', padding: space.md },
  rowBody: { flex: 1 },
  sender: { color: color.textPrimary, fontSize: typography.body.size, fontWeight: '600' },
  subject: { color: color.textPrimary, fontSize: typography.body.size },
});
