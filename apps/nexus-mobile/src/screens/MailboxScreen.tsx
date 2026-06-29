import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import {
  hasFlag,
  isUnread,
  MessageFlag,
  toFolderId,
  type AccountId,
  type FolderId,
  type MailMessage,
  type MessageId,
} from '@nexus/domain';
import { classifyError } from '@nexus/core-transport';
import { radius, space, typography } from '@nexus/ui-kit';
import { DEMO_INBOX_ID } from '../config';
import type { AppContainer } from '../composition/container';
import { archive, remove, setRead } from '../actions/messageActions';
import { ScreenHeader } from '../components/ScreenHeader';
import { Icon, IconButton } from '../components/Icon';
import { Avatar } from '../components/Avatar';
import { Segmented } from '../components/Segmented';
import { FAB } from '../components/FAB';
import { Press } from '../components/Press';
import { SwipeableRow } from '../components/SwipeableRow';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

/** Hermes-sichere Relativ-Zeit (ohne Intl): „9:42" · „Gestern" · „Mo" · „12.03.". */
function pad2(n: number): string {
  return n < 10 ? `0${String(n)}` : String(n);
}
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
function relativeTime(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  const yesterday =
    d.getFullYear() === y.getFullYear() &&
    d.getMonth() === y.getMonth() &&
    d.getDate() === y.getDate();
  if (yesterday) return 'Gestern';
  const diff = now.getTime() - ms;
  if (diff > 0 && diff < 6 * 86_400_000) return WEEKDAYS[d.getDay()] ?? '';
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.`;
}

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
  // Filter „nur ungelesene Mails" (Kopf-Umschalter).
  const [unreadOnly, setUnreadOnly] = useState(false);

  const load = useCallback(async () => {
    const items = await container.mailStore.listFolder(account, folderId, 100, 0);
    setMessages(items);
  }, [container, account, folderId]);

  const sync = useCallback(async () => {
    setRefreshing(true);
    setSyncError(null);
    try {
      // Delta-bewusst: den persistierten Cursor mitgeben (statt jedes Mal Voll-Sync) und den
      // neuen Cursor zurückschreiben — konsistent mit dem Hintergrund-Sync.
      const ck = `${account}:messages:${folderId}`;
      const cursor = await container.cursors.getCursor(ck);
      const res = await container.sync.syncMessages(account, folderId, cursor);
      if (res.syncKey !== '') await container.cursors.setCursor(ck, res.syncKey);
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
    void load().catch(() => undefined);
  }, [load, syncSignal]);

  // Beim Öffnen/Ordnerwechsel einmal vom Server holen. Die Inbox synct bereits App.runDue
  // (cursor-aware) → hier nur Nicht-Inbox-Ordner aktiv holen (vermeidet Inbox-Doppel-Sync).
  const inboxId = useMemo(() => toFolderId(DEMO_INBOX_ID), []);
  useEffect(() => {
    if (folderId !== inboxId) void sync();
    // Nur an Konto/Ordner koppeln — nicht an jede sync-Neubildung (sonst Sync-Schleife).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, folderId]);

  const unreadCount = useMemo(() => messages.filter((m) => isUnread(m)).length, [messages]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const base = unreadOnly ? messages.filter((m) => isUnread(m)) : messages;
    if (needle.length === 0) return base;
    return base.filter(
      (m) =>
        m.subject.toLowerCase().includes(needle) ||
        m.preview.toLowerCase().includes(needle) ||
        (m.from.displayName ?? m.from.address).toLowerCase().includes(needle),
    );
  }, [messages, query, unreadOnly]);

  const onOpen = useCallback((id: MessageId) => onOpenMessage(id), [onOpenMessage]);

  // Wisch-Aktionen: optimistisch ausführen, dann lokal neu laden (Nachricht verlässt den Ordner).
  const onArchiveMsg = useCallback(
    (m: MailMessage) => {
      void archive(container, account, m)
        .then(load)
        .catch(() => undefined);
    },
    [container, account, load],
  );
  const onDeleteMsg = useCallback(
    (m: MailMessage) => {
      void remove(container, account, m)
        .then(load)
        .catch(() => undefined);
    },
    [container, account, load],
  );
  // Wischen von links nach rechts: Mail wieder als ungelesen markieren (offline-first via setRead).
  const onMarkUnreadMsg = useCallback(
    (m: MailMessage) => {
      void setRead(container, account, m, false)
        .then(load)
        .catch(() => undefined);
    },
    [container, account, load],
  );

  const keyExtractor = useCallback((m: MailMessage) => m.id, []);
  const renderItem = useCallback(
    ({ item }: { item: MailMessage }) => (
      <MessageRow
        item={item}
        s={s}
        t={t}
        onOpen={onOpen}
        onArchive={onArchiveMsg}
        onDelete={onDeleteMsg}
        onMarkUnread={onMarkUnreadMsg}
      />
    ),
    [s, t, onOpen, onArchiveMsg, onDeleteMsg, onMarkUnreadMsg],
  );

  return (
    <View style={s.screen}>
      <ScreenHeader
        title={folderTitle}
        left={<IconButton name="menu" color={t.c.textPrimary} onPress={onOpenDrawer} />}
        search={{ value: query, onChange: setQuery, placeholder: `In „${folderTitle}" suchen` }}
      >
        <View style={s.filterBar}>
          <Segmented
            options={[
              { key: 'all', label: 'Alle' },
              {
                key: 'unread',
                label: unreadCount > 0 ? `Ungelesen (${String(unreadCount)})` : 'Ungelesen',
              },
            ]}
            value={unreadOnly ? 'unread' : 'all'}
            onChange={(k) => setUnreadOnly(k === 'unread')}
          />
        </View>
      </ScreenHeader>
      {syncError !== null ? (
        <Pressable style={s.banner} onPress={() => setSyncError(null)}>
          <Text style={s.bannerText} numberOfLines={2}>
            Aktualisierung fehlgeschlagen: {syncError}
          </Text>
        </Pressable>
      ) : null}
      <FlatList
        data={filtered}
        keyExtractor={keyExtractor}
        contentContainerStyle={filtered.length === 0 ? s.emptyWrap : s.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void sync()}
            tintColor={t.c.textSecondary}
          />
        }
        ListEmptyComponent={<Text style={s.empty}>Keine Nachrichten.</Text>}
        renderItem={renderItem}
        removeClippedSubviews
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={11}
      />
      <FAB icon="edit" onPress={onCompose} />
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

/** Memoisierte Listenzeile — Avatar, Absender + Zeit, 2-zeilige Vorschau, Ungelesen-Akzent,
 *  Wisch-Aktionen (Archivieren/Löschen) und weiches Press-Feedback. */
const MessageRow = React.memo(function MessageRow({
  item,
  s,
  t,
  onOpen,
  onArchive,
  onDelete,
  onMarkUnread,
}: {
  readonly item: MailMessage;
  readonly s: Styles;
  readonly t: AppTheme;
  readonly onOpen: (id: MessageId) => void;
  readonly onArchive: (m: MailMessage) => void;
  readonly onDelete: (m: MailMessage) => void;
  readonly onMarkUnread: (m: MailMessage) => void;
}): React.JSX.Element {
  const unread = isUnread(item);
  const sender = item.from.displayName ?? item.from.address;
  return (
    <SwipeableRow
      onArchive={() => onArchive(item)}
      onDelete={() => onDelete(item)}
      {...(unread ? {} : { onMarkUnread: () => onMarkUnread(item) })}
    >
      <Press onPress={() => onOpen(item.id)} style={s.row}>
        <View style={s.lead}>{unread ? <View style={s.unreadDot} /> : null}</View>
        <Avatar name={sender} colorKey={item.from.address} size={46} />
        <View style={s.rowBody}>
          <View style={s.rowTop}>
            <Text numberOfLines={1} style={[s.sender, unread ? s.senderUnread : null]}>
              {sender}
            </Text>
            <Text style={s.time}>{relativeTime(item.receivedAt)}</Text>
          </View>
          <Text numberOfLines={1} style={[s.subject, unread ? s.subjectUnread : null]}>
            {item.subject.length > 0 ? item.subject : '(Kein Betreff)'}
          </Text>
          <Text numberOfLines={2} style={s.preview}>
            {item.preview}
          </Text>
        </View>
        {hasFlag(item, MessageFlag.Flagged) ? (
          <View style={s.rowRight}>
            <Icon name="flag" size={15} color={t.c.warning} />
          </View>
        ) : null}
      </Press>
    </SwipeableRow>
  );
});

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    banner: {
      backgroundColor: t.c.danger + '14',
      borderRadius: radius.sm,
      marginHorizontal: space.md,
      marginBottom: space.xs,
      padding: space.sm,
    },
    filterBar: { paddingHorizontal: space.md, paddingBottom: space.sm },
    bannerText: { color: t.c.danger, fontSize: typography.caption.size },
    empty: { color: t.c.textSecondary, fontSize: typography.body.size, textAlign: 'center' },
    emptyWrap: { flexGrow: 1, justifyContent: 'center', padding: space.lg },
    lead: { alignItems: 'center', height: 46, justifyContent: 'center', width: 10 },
    listContent: { paddingBottom: 96 },
    preview: {
      color: t.c.textSecondary,
      fontSize: typography.caption.size,
      lineHeight: 18,
      marginTop: 1,
    },
    row: {
      alignItems: 'flex-start',
      backgroundColor: t.c.bgCanvas,
      flexDirection: 'row',
      gap: space.sm,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
    },
    rowBody: { flex: 1, minWidth: 0 },
    rowRight: { alignItems: 'flex-end', gap: 6, marginLeft: space.xs, paddingTop: 4 },
    rowTop: { alignItems: 'center', flexDirection: 'row', gap: space.xs },
    screen: { backgroundColor: t.c.bgCanvas, flex: 1 },
    sender: { color: t.c.textPrimary, flex: 1, fontSize: typography.body.size, fontWeight: '600' },
    senderUnread: { fontWeight: '800' },
    subject: { color: t.c.textPrimary, fontSize: typography.body.size, marginTop: 1 },
    subjectUnread: { fontWeight: '700' },
    time: { color: t.c.textSecondary, fontSize: typography.caption.size },
    unreadDot: { backgroundColor: t.c.brandPrimary, borderRadius: 5, height: 10, width: 10 },
  });
}
