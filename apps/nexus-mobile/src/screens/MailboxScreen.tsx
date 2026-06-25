import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import {
  hasFlag,
  isUnread,
  MessageFlag,
  type AccountId,
  type FolderId,
  type MailMessage,
  type MessageId,
} from '@nexus/domain';
import { classifyError } from '@nexus/core-transport';
import { radius, space, typography } from '@nexus/ui-kit';
import type { AppContainer } from '../composition/container';
import { ScreenHeader } from '../components/ScreenHeader';
import { GLYPH, IconButton } from '../components/Icon';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface Props {
  readonly container: AppContainer;
  readonly account: AccountId;
  readonly folderId: FolderId;
  readonly folderTitle: string;
  readonly onOpenMessage: (messageId: MessageId) => void;
  readonly onCompose: () => void;
  readonly onOpenDrawer: () => void;
  /** Wird bei abgelehnter Anmeldung (401/403) während eines Syncs aufgerufen. */
  readonly onAuthExpired: () => void;
  /** Zähler, der sich nach jedem Hintergrund-Sync erhöht → lokal neu laden. */
  readonly syncSignal: number;
}

export function MailboxScreen({
  container,
  account,
  folderId,
  folderTitle,
  onOpenMessage,
  onCompose,
  onOpenDrawer,
  onAuthExpired,
  syncSignal,
}: Props): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  const [messages, setMessages] = useState<readonly MailMessage[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [syncError, setSyncError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const items = await container.mailStore.listFolder(account, folderId, 100, 0);
    setMessages(items);
  }, [container, account, folderId]);

  const sync = useCallback(async () => {
    setRefreshing(true);
    setSyncError(null);
    try {
      await container.sync.syncMessages(account, folderId);
      await container.outbox.drain(account);
      await load();
    } catch (e: unknown) {
      const info = classifyError(e);
      // Abgelehnte Anmeldung (z. B. geändertes/abgelaufenes Passwort) → sauber ausloggen.
      if (info.kind === 'auth') {
        onAuthExpired();
        return;
      }
      // Sonstige Fehler dürfen die App NIE abstürzen lassen — als Banner zeigen.
      setSyncError(info.detail);
    } finally {
      setRefreshing(false);
    }
  }, [container, account, folderId, load, onAuthExpired]);

  // Lokal laden: beim Öffnen/Ordnerwechsel UND nach jedem Hintergrund-Sync (syncSignal).
  useEffect(() => {
    void load();
  }, [load, syncSignal]);

  // Beim Öffnen/Ordnerwechsel einmal vom Server holen (damit der Ordner sofort befüllt wird).
  useEffect(() => {
    void sync();
    // Nur an Konto/Ordner koppeln — nicht an jede sync-Neubildung (sonst Sync-Schleife).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, folderId]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return messages;
    return messages.filter(
      (m) =>
        m.subject.toLowerCase().includes(needle) ||
        m.preview.toLowerCase().includes(needle) ||
        (m.from.displayName ?? m.from.address).toLowerCase().includes(needle),
    );
  }, [messages, query]);

  return (
    <View style={s.screen}>
      <ScreenHeader
        title={folderTitle}
        left={<IconButton glyph={GLYPH.menu} color={t.c.textPrimary} onPress={onOpenDrawer} />}
        right={<IconButton glyph={GLYPH.compose} color={t.c.brandPrimary} onPress={onCompose} />}
        search={{ value: query, onChange: setQuery, placeholder: `In „${folderTitle}" suchen` }}
      />
      {syncError !== null ? (
        <Pressable style={s.banner} onPress={() => setSyncError(null)}>
          <Text style={s.bannerText} numberOfLines={2}>
            Aktualisierung fehlgeschlagen: {syncError}
          </Text>
        </Pressable>
      ) : null}
      <FlatList
        data={filtered}
        keyExtractor={(m) => m.id}
        contentContainerStyle={filtered.length === 0 ? s.emptyWrap : undefined}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void sync()}
            tintColor={t.c.textSecondary}
          />
        }
        ListEmptyComponent={<Text style={s.empty}>Keine Nachrichten.</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [s.row, pressed ? s.rowPressed : null]}
            onPress={() => {
              onOpenMessage(item.id);
            }}
          >
            <View style={[s.dot, { opacity: isUnread(item) ? 1 : 0 }]} />
            <View style={s.rowBody}>
              <Text numberOfLines={1} style={[s.sender, isUnread(item) ? s.unread : null]}>
                {item.from.displayName ?? item.from.address}
              </Text>
              <Text numberOfLines={1} style={s.subject}>
                {item.subject}
              </Text>
              <Text numberOfLines={1} style={s.preview}>
                {item.preview}
              </Text>
            </View>
            {hasFlag(item, MessageFlag.Flagged) ? <Text style={s.flag}>⚑</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    banner: {
      backgroundColor: t.c.danger + '14',
      borderRadius: radius.sm,
      marginHorizontal: space.md,
      marginBottom: space.xs,
      padding: space.sm,
    },
    bannerText: { color: t.c.danger, fontSize: typography.caption.size },
    dot: {
      backgroundColor: t.c.brandPrimary,
      borderRadius: 4,
      height: 8,
      marginRight: space.sm,
      marginTop: space.xs,
      width: 8,
    },
    empty: { color: t.c.textSecondary, fontSize: typography.body.size, textAlign: 'center' },
    emptyWrap: { flexGrow: 1, justifyContent: 'center', padding: space.lg },
    flag: { color: t.c.warning, fontSize: typography.body.size, marginLeft: space.sm },
    preview: { color: t.c.textSecondary, fontSize: typography.caption.size },
    row: {
      borderBottomColor: t.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      padding: space.md,
    },
    rowBody: { flex: 1, minWidth: 0 },
    rowPressed: { backgroundColor: t.rowActive },
    screen: { backgroundColor: t.c.bgCanvas, flex: 1 },
    sender: { color: t.c.textPrimary, fontSize: typography.body.size, fontWeight: '600' },
    subject: { color: t.c.textPrimary, fontSize: typography.body.size },
    unread: { fontWeight: '800' },
  });
}
