import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  BodyType,
  hasFlag,
  isUnread,
  MessageFlag,
  type AccountId,
  type Attachment,
  type MailMessage,
  type MessageId,
} from '@nexus/domain';
import { color, radius, space, typography } from '@nexus/ui-kit';
import type { AppContainer } from '../composition/container';
import { archive, remove, setRead, toggleFlag } from '../actions/messageActions';

/** Sehr einfache HTML→Text-Reduktion (ohne WebView-Abhängigkeit; echtes HTML-Rendering folgt). */
function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function bodyText(m: MailMessage): string {
  const content = m.body?.content ?? m.preview;
  return m.body?.type === BodyType.Html ? htmlToText(content) : content;
}

function formatSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1000) return `${Math.round(bytes / 1000)} KB`;
  return `${bytes} B`;
}

interface Props {
  readonly container: AppContainer;
  readonly account: AccountId;
  readonly messageId: MessageId;
  readonly onBack: () => void;
  readonly onReply: (message: MailMessage) => void;
}

export function MessageScreen({
  container,
  account,
  messageId,
  onBack,
  onReply,
}: Props): React.JSX.Element {
  const [message, setMessage] = useState<MailMessage | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void container.mailStore.getMessage(account, messageId).then((m) => {
      if (!active) return;
      setMessage(m);
      // Beim Öffnen automatisch als gelesen markieren (optimistisch + Outbox).
      if (m !== undefined && isUnread(m)) {
        void setRead(container, account, m).then((updated) => {
          if (active) setMessage(updated);
        });
      }
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

  const onDownload = async (a: Attachment): Promise<void> => {
    try {
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
    <View style={styles.container}>
      <Pressable style={styles.back} onPress={onBack} hitSlop={8}>
        <Text style={styles.backText}>‹ Posteingang</Text>
      </Pressable>
      {message === undefined ? (
        <Text style={styles.meta}>Nachricht nicht gefunden.</Text>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.subject}>{message.subject}</Text>
            <Text style={styles.meta}>{message.from.displayName ?? message.from.address}</Text>
            {message.categories.length > 0 ? (
              <Text style={styles.categories}>{message.categories.join(' · ')}</Text>
            ) : null}
            <Text style={styles.body}>{bodyText(message)}</Text>

            {message.attachments.length > 0 ? (
              <View style={styles.attachWrap}>
                <Text style={styles.attachHead}>Anhänge ({message.attachments.length})</Text>
                {message.attachments.map((a) => (
                  <Pressable key={a.id} style={styles.attachRow} onPress={() => void onDownload(a)}>
                    <Text style={styles.attachIcon}>📎</Text>
                    <Text style={styles.attachName} numberOfLines={1}>
                      {a.name}
                    </Text>
                    <Text style={styles.attachMeta}>{formatSize(a.sizeBytes)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            <Action label="Antworten" onPress={() => onReply(message)} primary />
            <Action
              label={isUnread(message) ? 'Gelesen' : 'Ungelesen'}
              onPress={() => void onToggleRead()}
            />
            <Action
              label={hasFlag(message, MessageFlag.Flagged) ? 'Entmarkieren' : 'Markieren'}
              onPress={() => void onToggleFlag()}
            />
            <Action label="Archiv" onPress={() => void onArchive()} />
            <Action label="Löschen" onPress={() => void onDelete()} danger />
          </View>
        </>
      )}
    </View>
  );
}

function Action({
  label,
  onPress,
  primary,
  danger,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly primary?: boolean;
  readonly danger?: boolean;
}): React.JSX.Element {
  return (
    <Pressable style={styles.action} onPress={onPress} hitSlop={6}>
      <Text
        style={[
          styles.actionText,
          primary === true ? styles.actionPrimary : null,
          danger === true ? styles.actionDanger : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    backgroundColor: color.bgElevated,
    borderRadius: radius.sm,
    flexGrow: 1,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  actionDanger: { color: color.danger },
  actionPrimary: { color: color.brandPrimary, fontWeight: '700' },
  actionText: {
    color: color.textPrimary,
    fontSize: typography.caption.size,
    fontWeight: '600',
    textAlign: 'center',
  },
  actions: {
    borderTopColor: color.bgElevated,
    borderTopWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    padding: space.md,
  },
  attachHead: {
    color: color.textSecondary,
    fontSize: typography.caption.size,
    fontWeight: '700',
    marginBottom: space.xs,
  },
  attachIcon: { fontSize: typography.body.size, marginRight: space.sm },
  attachMeta: {
    color: color.textSecondary,
    fontSize: typography.caption.size,
    marginLeft: space.sm,
  },
  attachName: { color: color.textPrimary, flex: 1, fontSize: typography.body.size },
  attachRow: {
    alignItems: 'center',
    backgroundColor: color.bgElevated,
    borderRadius: radius.sm,
    flexDirection: 'row',
    marginBottom: space.xs,
    padding: space.sm,
  },
  attachWrap: { marginTop: space.lg },
  back: { paddingHorizontal: space.md, paddingVertical: space.sm },
  backText: { color: color.brandPrimary, fontSize: typography.body.size },
  body: { color: color.textPrimary, fontSize: typography.body.size, marginTop: space.md },
  categories: { color: color.accent, fontSize: typography.caption.size, marginTop: space.xs },
  container: { backgroundColor: color.bgCanvas, flex: 1 },
  content: { padding: space.md },
  meta: { color: color.textSecondary, fontSize: typography.caption.size, marginTop: space.xs },
  subject: { color: color.textPrimary, fontSize: typography.headline.size, fontWeight: '700' },
});
