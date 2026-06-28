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
import { useTheme, type AppTheme } from '../theme/ThemeContext';

function formatSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1000) return `${Math.round(bytes / 1000)} KB`;
  return `${bytes} B`;
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

  return (
    <View style={s.container}>
      <Pressable style={s.back} onPress={onBack} hitSlop={8}>
        <Text style={s.backText}>‹ {backLabel}</Text>
      </Pressable>
      {message === undefined ? (
        <Text style={s.meta}>Nachricht nicht gefunden.</Text>
      ) : (
        <>
          <ScrollView contentContainerStyle={s.content}>
            <Text style={s.subject}>{message.subject}</Text>
            <Text style={s.meta}>{message.from.displayName ?? message.from.address}</Text>
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
                    <Text style={s.attachIcon}>📎</Text>
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
            {onEdit !== undefined ? (
              <Action t={t} label="Bearbeiten" onPress={() => onEdit(message)} primary />
            ) : null}
            <Action t={t} label="Antworten" onPress={() => onCompose('reply', message)} primary />
            <Action t={t} label="Allen antw." onPress={() => onCompose('replyAll', message)} />
            <Action t={t} label="Weiterleiten" onPress={() => onCompose('forward', message)} />
            <Action
              t={t}
              label={isUnread(message) ? 'Gelesen' : 'Ungelesen'}
              onPress={() => void onToggleRead()}
            />
            <Action
              t={t}
              label={hasFlag(message, MessageFlag.Flagged) ? 'Entmarkieren' : 'Markieren'}
              onPress={() => void onToggleFlag()}
            />
            <Action t={t} label="Verschieben" onPress={openMove} />
            <Action t={t} label="Archiv" onPress={() => void onArchive()} />
            <Action t={t} label="Löschen" onPress={() => void onDelete()} danger />
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
    </View>
  );
}

function Action({
  t,
  label,
  onPress,
  primary,
  danger,
}: {
  readonly t: AppTheme;
  readonly label: string;
  readonly onPress: () => void;
  readonly primary?: boolean;
  readonly danger?: boolean;
}): React.JSX.Element {
  const s = useMemo(() => makeStyles(t), [t]);
  return (
    <Pressable style={s.action} onPress={onPress} hitSlop={6}>
      <Text
        style={[
          s.actionText,
          primary === true ? s.actionPrimary : null,
          danger === true ? s.actionDanger : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    action: {
      backgroundColor: t.c.bgElevated,
      borderRadius: radius.pill,
      flexGrow: 1,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
    },
    actionDanger: { color: t.c.danger },
    actionPrimary: { color: t.c.brandPrimary, fontWeight: '700' },
    actionText: {
      color: t.c.textPrimary,
      fontSize: typography.caption.size,
      fontWeight: '600',
      textAlign: 'center',
    },
    actions: {
      borderTopColor: t.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.xs,
      padding: space.md,
    },
    attachHead: {
      color: t.c.textSecondary,
      fontSize: typography.caption.size,
      fontWeight: '700',
      marginBottom: space.xs,
    },
    attachIcon: { fontSize: typography.body.size, marginRight: space.sm },
    attachMeta: {
      color: t.c.textSecondary,
      fontSize: typography.caption.size,
      marginLeft: space.sm,
    },
    attachName: { color: t.c.textPrimary, flex: 1, fontSize: typography.body.size },
    attachRow: {
      alignItems: 'center',
      backgroundColor: t.c.bgElevated,
      borderRadius: radius.md,
      flexDirection: 'row',
      marginBottom: space.xs,
      padding: space.sm,
    },
    attachWrap: { marginTop: space.lg },
    back: { paddingHorizontal: space.md, paddingVertical: space.sm },
    backText: { color: t.c.brandPrimary, fontSize: typography.body.size },
    body: {
      color: t.c.textPrimary,
      fontSize: typography.body.size,
      lineHeight: 22,
      marginTop: space.md,
    },
    categories: {
      alignSelf: 'flex-start',
      backgroundColor: t.c.accent + '1A',
      borderRadius: radius.pill,
      color: t.c.accent,
      fontSize: typography.caption.size,
      marginTop: space.xs,
      overflow: 'hidden',
      paddingHorizontal: space.sm,
      paddingVertical: 3,
    },
    container: { backgroundColor: t.c.bgCanvas, flex: 1 },
    content: { padding: space.md },
    htmlWrap: { marginTop: space.md },
    meta: { color: t.c.textSecondary, fontSize: typography.caption.size, marginTop: space.xs },
    subject: { color: t.c.textPrimary, fontSize: typography.headline.size, fontWeight: '700' },
  });
}
