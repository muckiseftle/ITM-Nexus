import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  hasFlag,
  isUnread,
  messageBodyToText,
  MessageFlag,
  type AccountId,
  type Attachment,
  type MailMessage,
  type MessageId,
  type ReplyMode,
} from '@nexus/domain';
import { radius, space, typography } from '@nexus/ui-kit';
import type { AppContainer } from '../composition/container';
import { archive, remove, setRead, toggleFlag } from '../actions/messageActions';
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
}

export function MessageScreen({
  container,
  account,
  messageId,
  backLabel,
  onBack,
  onCompose,
}: Props): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const [message, setMessage] = useState<MailMessage | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void container.mailStore.getMessage(account, messageId).then((m) => {
      if (!active) return;
      setMessage(m);
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
      Alert.alert(content.name, `${content.contentType} · ${formatSize(content.sizeBytes)} geladen.`);
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
            <Text style={s.body}>{messageBodyToText(message)}</Text>

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
            <Action t={t} label="Antworten" onPress={() => onCompose('reply', message)} primary />
            <Action t={t} label="Allen antw." onPress={() => onCompose('replyAll', message)} />
            <Action t={t} label="Weiterleiten" onPress={() => onCompose('forward', message)} />
            <Action t={t} label={isUnread(message) ? 'Gelesen' : 'Ungelesen'} onPress={() => void onToggleRead()} />
            <Action
              t={t}
              label={hasFlag(message, MessageFlag.Flagged) ? 'Entmarkieren' : 'Markieren'}
              onPress={() => void onToggleFlag()}
            />
            <Action t={t} label="Archiv" onPress={() => void onArchive()} />
            <Action t={t} label="Löschen" onPress={() => void onDelete()} danger />
          </View>
        </>
      )}
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
      borderRadius: radius.sm,
      flexGrow: 1,
      paddingHorizontal: space.sm,
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
    attachMeta: { color: t.c.textSecondary, fontSize: typography.caption.size, marginLeft: space.sm },
    attachName: { color: t.c.textPrimary, flex: 1, fontSize: typography.body.size },
    attachRow: {
      alignItems: 'center',
      backgroundColor: t.c.bgElevated,
      borderRadius: radius.sm,
      flexDirection: 'row',
      marginBottom: space.xs,
      padding: space.sm,
    },
    attachWrap: { marginTop: space.lg },
    back: { paddingHorizontal: space.md, paddingVertical: space.sm },
    backText: { color: t.c.brandPrimary, fontSize: typography.body.size },
    body: { color: t.c.textPrimary, fontSize: typography.body.size, lineHeight: 22, marginTop: space.md },
    categories: { color: t.c.accent, fontSize: typography.caption.size, marginTop: space.xs },
    container: { backgroundColor: t.c.bgCanvas, flex: 1 },
    content: { padding: space.md },
    meta: { color: t.c.textSecondary, fontSize: typography.caption.size, marginTop: space.xs },
    subject: { color: t.c.textPrimary, fontSize: typography.headline.size, fontWeight: '700' },
  });
}
