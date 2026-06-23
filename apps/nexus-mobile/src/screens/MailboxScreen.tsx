import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import {
  hasFlag,
  isUnread,
  MessageFlag,
  toFolderId,
  type AccountId,
  type MailMessage,
  type MessageId,
} from '@nexus/domain';
import { color, radius, space, typography } from '@nexus/ui-kit';
import type { AppContainer } from '../composition/container';
import { DEMO_INBOX_ID } from '../config';

interface Props {
  readonly container: AppContainer;
  readonly account: AccountId;
  readonly onOpenMessage: (messageId: MessageId) => void;
  readonly onCompose: () => void;
}

// Posteingang. EWS mappt 'inbox' serverseitig auf die DistinguishedFolderId.
const INBOX = toFolderId(DEMO_INBOX_ID);

export function MailboxScreen({
  container,
  account,
  onOpenMessage,
  onCompose,
}: Props): React.JSX.Element {
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
    <View style={styles.screen}>
      <View style={styles.bar}>
        <Text style={styles.barTitle}>Posteingang</Text>
        <Pressable style={styles.composeButton} onPress={onCompose} hitSlop={8}>
          <Text style={styles.composeText}>＋ Neu</Text>
        </Pressable>
      </View>
      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={messages.length === 0 ? styles.emptyWrap : undefined}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void sync()} />}
        ListEmptyComponent={<Text style={styles.empty}>Keine Nachrichten.</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => {
              onOpenMessage(item.id);
            }}
          >
            <View style={[styles.dot, { opacity: isUnread(item) ? 1 : 0 }]} />
            <View style={styles.rowBody}>
              <Text
                numberOfLines={1}
                style={[styles.sender, isUnread(item) ? styles.unread : null]}
              >
                {item.from.displayName ?? item.from.address}
              </Text>
              <Text numberOfLines={1} style={styles.subject}>
                {item.subject}
              </Text>
              <Text numberOfLines={1} style={styles.preview}>
                {item.preview}
              </Text>
            </View>
            {hasFlag(item, MessageFlag.Flagged) ? <Text style={styles.flag}>⚑</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  barTitle: { color: color.textPrimary, fontSize: typography.headline.size, fontWeight: '700' },
  composeButton: {
    backgroundColor: color.brandPrimary,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  composeText: { color: '#FFFFFF', fontSize: typography.body.size, fontWeight: '600' },
  dot: {
    backgroundColor: color.brandPrimary,
    borderRadius: 4,
    height: 8,
    marginRight: space.sm,
    marginTop: space.xs,
    width: 8,
  },
  empty: { color: color.textSecondary, fontSize: typography.body.size, textAlign: 'center' },
  emptyWrap: { flexGrow: 1, justifyContent: 'center', padding: space.lg },
  flag: { color: color.warning, fontSize: typography.body.size, marginLeft: space.sm },
  preview: { color: color.textSecondary, fontSize: typography.caption.size },
  row: { flexDirection: 'row', padding: space.md },
  rowBody: { flex: 1 },
  screen: { backgroundColor: color.bgCanvas, flex: 1 },
  sender: { color: color.textPrimary, fontSize: typography.body.size, fontWeight: '600' },
  subject: { color: color.textPrimary, fontSize: typography.body.size },
  unread: { fontWeight: '800' },
});
