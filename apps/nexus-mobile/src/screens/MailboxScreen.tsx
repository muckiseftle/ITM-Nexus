import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import {
  isUnread,
  toFolderId,
  type AccountId,
  type MailMessage,
  type MessageId,
} from '@nexus/domain';
import { color, space, typography } from '@nexus/ui-kit';
import type { AppContainer } from '../composition/container';
import { DEMO_INBOX_ID } from '../config';

interface Props {
  readonly container: AppContainer;
  readonly account: AccountId;
  readonly onOpenMessage: (messageId: MessageId) => void;
}

// Posteingang. EWS mappt 'inbox' serverseitig auf die DistinguishedFolderId.
const INBOX = toFolderId(DEMO_INBOX_ID);

export function MailboxScreen({ container, account, onOpenMessage }: Props): React.JSX.Element {
  const [messages, setMessages] = useState<readonly MailMessage[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const items = await container.mailStore.listFolder(account, INBOX, 100, 0);
    setMessages(items);
  }, [container, account]);

  const sync = useCallback(async () => {
    setRefreshing(true);
    try {
      await container.sync.syncMessages(account, INBOX);
      await container.outbox.drain(account);
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [container, account, load]);

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
