import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  BodyType,
  hasFlag,
  isUnread,
  messageBodyToText,
  MessageFlag,
  toFolderId,
  type AccountId,
  type Attachment,
  type FolderId,
  type MailFolder,
  type MailMessage,
  type MessageId,
  type ReplyMode,
} from '@nexus/domain';
import { radius, space, typography } from '@nexus/ui-kit';
import type { AppContainer } from '../composition/container';
import { archive, moveToFolder, remove, setRead, toggleFlag } from '../actions/messageActions';
import { OptionSheet, type SheetOption } from '../components/BottomSheet';
import { HtmlBody } from '../components/HtmlBody';
import { Avatar } from '../components/Avatar';
import { Icon, type IconName } from '../components/Icon';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

function formatSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1000) return `${Math.round(bytes / 1000)} KB`;
  return `${bytes} B`;
}

/** Vollständiges Datum + Uhrzeit der E-Mail (z. B. „Montag, 29. Juni 2026, 14:32"). */
function fullDateTime(ms: number): string {
  const d = new Date(ms);
  const date = d.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

interface Props {
  readonly container: AppContainer;
  readonly account: AccountId;
  readonly messageId: MessageId;
  readonly backLabel: string;
  readonly onBack: () => void;
  readonly onCompose: (mode: ReplyMode, message: MailMessage) => void;
  /** Nur für Entwürfe: öffnet die Nachricht zum Weiterbearbeiten im Composer. */
  readonly onEdit?: (message: MailMessage) => void;
}

export function MessageScreen({
  container,
  account,
  messageId,
  backLabel,
  onBack,
  onCompose,
  onEdit,
}: Props): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const [message, setMessage] = useState<MailMessage | undefined>(undefined);
  const [folders, setFolders] = useState<readonly MailFolder[]>([]);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // Externe Bilder pro geöffneter Nachricht erst nach ausdrücklicher Freigabe laden (Tracking-Schutz).
  const [showRemoteImages, setShowRemoteImages] = useState(false);

  useEffect(() => {
    let active = true;
    setShowRemoteImages(false);
    void container.mailStore
      .getMessage(account, messageId)
      .then((m) => {
        if (!active) return;
        setMessage(m);
        if (m === undefined) return;
        if (isUnread(m)) {
          void setRead(container, account, m)
            .then((updated) => {
              // Bereits nachgeladenen HTML-Body NICHT durch den (evtl. älteren) Text-Body ersetzen.
              if (active) setMessage((prev) => (prev ? { ...updated, body: prev.body } : updated));
            })
            .catch(() => undefined);
        }
        // Der Listen-Sync hält Nachrichten schlank (nur Text-Vorschau), damit große HTML-Mails
        // den Speicher beim Sync nicht sprengen. Den vollständigen HTML-Body daher erst beim
        // Öffnen einzeln vom Server holen und lokal cachen (Offline + schnelleres Wieder-Öffnen).
        // Schlägt der Abruf fehl (offline/Demo), bleibt die gecachte Text-Vorschau bestehen.
        if (m.body?.type !== BodyType.Html) {
          void container.transport
            .getMessage(account, messageId)
            .then((full) => {
              if (!active || full.body === undefined) return;
              // Auf den AKTUELLEN Stand mergen (prev), NICHT auf das vor `setRead` geladene `m` —
              // sonst würde der gerade gesetzte Gelesen-Status wieder überschrieben (Mail bliebe
              // „ungelesen" / verschwände aus dem Ungelesen-Filter). prev enthält den read-Flag.
              setMessage((prev) => {
                const base: MailMessage = prev ?? m;
                const enriched: MailMessage = {
                  ...base,
                  body: full.body,
                  attachments: full.attachments.length > 0 ? full.attachments : base.attachments,
                };
                void container.mailStore.upsertMessages([enriched]).catch(() => undefined);
                return enriched;
              });
            })
            .catch(() => undefined);
        }
      })
      .catch(() => {
        if (active) setMessage(undefined);
      });
    return () => {
      active = false;
    };
  }, [container, account, messageId]);

  const onToggleRead = async (): Promise<void> => {
    if (message === undefined) return;
    const updated = await setRead(container, account, message, isUnread(message));
    setMessage(updated);
  };

  const onToggleFlag = async (): Promise<void> => {
    if (message === undefined) return;
    const updated = await toggleFlag(container, account, message);
    setMessage(updated);
  };

  const onArchive = async (): Promise<void> => {
    if (message === undefined) return;
    await archive(container, account, message);
    onBack();
  };

  const onDelete = async (): Promise<void> => {
    if (message === undefined) return;
    await remove(container, account, message);
    onBack();
  };

  const openMove = (): void => {
    void container.folders
      .listFolders(account)
      .then(setFolders)
      .catch(() => undefined);
    setMoveOpen(true);
  };

  const doMove = async (folderId: FolderId): Promise<void> => {
    if (message === undefined) return;
    await moveToFolder(container, account, message, folderId);
    onBack();
  };

  const onDownload = async (a: Attachment): Promise<void> => {
    try {
      // Live-Modus (H9): Anhang nativ in eine Datei laden und das System-Teilen-Blatt öffnen
      // (kein Base64 im JS-Heap). Demo-Modus: Anhang abrufen und kurze Meldung anzeigen.
      if (container.openAttachment !== undefined) {
        await container.openAttachment(account, a.id);
        return;
      }
      const content = await container.transport.getAttachment(account, a.id);
      Alert.alert(
        content.name,
        `${content.contentType} · ${formatSize(content.sizeBytes)} geladen.`,
      );
    } catch {
      Alert.alert('Anhang', 'Konnte nicht geladen werden.');
    }
  };

  const flagged = message !== undefined && hasFlag(message, MessageFlag.Flagged);
  const moreOptions: SheetOption[] =
    message === undefined
      ? []
      : [
          { key: 'move', label: 'In Ordner verschieben' },
          {
            key: 'read',
            label: isUnread(message) ? 'Als gelesen markieren' : 'Als ungelesen markieren',
          },
          ...(onEdit !== undefined ? [{ key: 'edit', label: 'Bearbeiten' } as SheetOption] : []),
        ];
  const onMoreSelect = (key: string): void => {
    if (message === undefined) return;
    if (key === 'move') openMove();
    else if (key === 'read') void onToggleRead();
    else if (key === 'edit') onEdit?.(message);
  };

  return (
    <View style={s.container}>
      <View style={s.topbar}>
        <Pressable style={s.back} onPress={onBack} hitSlop={8}>
          <Icon name="chevronLeft" size={22} color={t.c.brandPrimary} />
          <Text style={s.backText} numberOfLines={1}>
            {backLabel}
          </Text>
        </Pressable>
        {message !== undefined ? (
          <Pressable style={s.starBtn} onPress={() => void onToggleFlag()} hitSlop={8}>
            <Icon name="star" size={22} color={flagged ? t.c.warning : t.c.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {message === undefined ? (
        <Text style={s.meta}>Nachricht nicht gefunden.</Text>
      ) : (
        <>
          <ScrollView contentContainerStyle={s.content}>
            <Text style={s.subject}>
              {message.subject.length > 0 ? message.subject : '(Kein Betreff)'}
            </Text>
            <View style={s.senderRow}>
              <Avatar
                name={message.from.displayName ?? message.from.address}
                colorKey={message.from.address}
                size={44}
              />
              <View style={s.senderBody}>
                <Text style={s.senderName} numberOfLines={1}>
                  {message.from.displayName ?? message.from.address}
                </Text>
                {message.from.displayName !== undefined ? (
                  <Text style={s.senderAddr} numberOfLines={1}>
                    {message.from.address}
                  </Text>
                ) : null}
                <Text style={s.dateTime}>{fullDateTime(message.sentAt ?? message.receivedAt)}</Text>
              </View>
            </View>
            {message.categories.length > 0 ? (
              <Text style={s.categories}>{message.categories.join(' · ')}</Text>
            ) : null}
            {message.body?.type === BodyType.Html ? (
              <View style={s.htmlWrap}>
                <HtmlBody
                  html={message.body.content}
                  loadRemoteImages={showRemoteImages}
                  onRequestRemoteImages={() => setShowRemoteImages(true)}
                />
              </View>
            ) : (
              <Text style={s.body}>{messageBodyToText(message)}</Text>
            )}

            {message.attachments.length > 0 ? (
              <View style={s.attachWrap}>
                <Text style={s.attachHead}>Anhänge ({message.attachments.length})</Text>
                {message.attachments.map((a) => (
                  <Pressable key={a.id} style={s.attachRow} onPress={() => void onDownload(a)}>
                    <Icon name="paperclip" size={18} color={t.c.textSecondary} />
                    <Text style={s.attachName} numberOfLines={1}>
                      {a.name}
                    </Text>
                    <Text style={s.attachMeta}>{formatSize(a.sizeBytes)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </ScrollView>

          <View style={s.actions}>
            <ActionIcon
              t={t}
              icon="reply"
              label="Antw."
              onPress={() => onCompose('reply', message)}
            />
            <ActionIcon
              t={t}
              icon="replyAll"
              label="Allen"
              onPress={() => onCompose('replyAll', message)}
            />
            <ActionIcon
              t={t}
              icon="forward"
              label="Weiter"
              onPress={() => onCompose('forward', message)}
            />
            <ActionIcon t={t} icon="archive" label="Archiv" onPress={() => void onArchive()} />
            <ActionIcon t={t} icon="trash" label="Löschen" danger onPress={() => void onDelete()} />
            <ActionIcon t={t} icon="more" label="Mehr" onPress={() => setMoreOpen(true)} />
          </View>
        </>
      )}

      <OptionSheet
        visible={moveOpen}
        onClose={() => setMoveOpen(false)}
        title="In Ordner verschieben"
        options={folders
          .filter((f) => f.id !== message?.folderId)
          .map((f): SheetOption => ({ key: f.id, label: f.displayName }))}
        selected=""
        onSelect={(key) => void doMove(toFolderId(key))}
      />
      <OptionSheet
        visible={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="Weitere Aktionen"
        options={moreOptions}
        selected=""
        onSelect={onMoreSelect}
      />
    </View>
  );
}

function ActionIcon({
  t,
  icon,
  label,
  onPress,
  danger,
}: {
  readonly t: AppTheme;
  readonly icon: IconName;
  readonly label: string;
  readonly onPress: () => void;
  readonly danger?: boolean;
}): React.JSX.Element {
  const s = useMemo(() => makeStyles(t), [t]);
  const color = danger === true ? t.c.danger : t.c.brandPrimary;
  return (
    <Pressable style={s.action} onPress={onPress} hitSlop={4}>
      <Icon name={icon} size={23} color={color} />
      <Text style={[s.actionText, danger === true ? s.actionDanger : null]}>{label}</Text>
    </Pressable>
  );
}

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    action: { alignItems: 'center', flexGrow: 1, gap: 3, paddingVertical: space.xs },
    actionDanger: { color: t.c.danger },
    actionText: {
      color: t.c.brandPrimary,
      fontSize: 11,
      fontWeight: '600',
      textAlign: 'center',
    },
    actions: {
      flexDirection: 'row',
      gap: space.xs,
      paddingHorizontal: space.sm,
      paddingTop: space.sm,
    },
    attachHead: {
      color: t.c.textSecondary,
      fontSize: typography.caption.size,
      fontWeight: '700',
      marginBottom: space.xs,
    },
    attachMeta: {
      color: t.c.textSecondary,
      fontSize: typography.caption.size,
      marginLeft: space.sm,
    },
    attachName: { color: t.c.textPrimary, flex: 1, fontSize: typography.body.size },
    attachRow: {
      alignItems: 'center',
      backgroundColor: t.c.card,
      borderRadius: radius.md,
      flexDirection: 'row',
      gap: space.sm,
      marginBottom: space.xs,
      padding: space.sm,
    },
    attachWrap: { marginTop: space.lg },
    back: { alignItems: 'center', flexDirection: 'row', flexShrink: 1, gap: 2 },
    backText: { color: t.c.brandPrimary, fontSize: typography.body.size },
    body: {
      color: t.c.textPrimary,
      fontSize: typography.body.size,
      lineHeight: 23,
      marginTop: space.lg,
    },
    categories: {
      alignSelf: 'flex-start',
      backgroundColor: t.c.accent + '1A',
      borderRadius: radius.pill,
      color: t.c.accent,
      fontSize: typography.caption.size,
      marginTop: space.sm,
      overflow: 'hidden',
      paddingHorizontal: space.sm,
      paddingVertical: 3,
    },
    container: { backgroundColor: t.c.bgCanvas, flex: 1 },
    content: { padding: space.md, paddingBottom: space.lg },
    dateTime: { color: t.c.textSecondary, fontSize: typography.caption.size, marginTop: 2 },
    htmlWrap: { marginTop: space.lg },
    meta: { color: t.c.textSecondary, fontSize: typography.caption.size, marginTop: space.xs },
    senderAddr: { color: t.c.textSecondary, fontSize: typography.caption.size },
    senderBody: { flex: 1, minWidth: 0 },
    senderName: { color: t.c.textPrimary, fontSize: typography.body.size, fontWeight: '600' },
    senderRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: space.sm,
      marginTop: space.md,
    },
    starBtn: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
    subject: {
      color: t.c.textPrimary,
      fontSize: 24,
      fontWeight: '700',
      lineHeight: 30,
    },
    topbar: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: space.md,
      paddingVertical: space.xs,
    },
  });
}
