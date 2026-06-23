import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  hasFlag,
  isUnread,
  MessageFlag,
  type AccountId,
  type MailMessage,
  type MessageId,
} from '@nexus/domain';
import { color, radius, space, typography } from '@nexus/ui-kit';
import type { AppContainer } from '../composition/container';
import { archive, remove, setRead, toggleFlag } from '../actions/messageActions';

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
            <Text style={styles.body}>{message.body?.content ?? message.preview}</Text>
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
  back: { paddingHorizontal: space.md, paddingVertical: space.sm },
  backText: { color: color.brandPrimary, fontSize: typography.body.size },
  body: { color: color.textPrimary, fontSize: typography.body.size, marginTop: space.md },
  categories: { color: color.accent, fontSize: typography.caption.size, marginTop: space.xs },
  container: { backgroundColor: color.bgCanvas, flex: 1 },
  content: { padding: space.md },
  meta: { color: color.textSecondary, fontSize: typography.caption.size, marginTop: space.xs },
  subject: { color: color.textPrimary, fontSize: typography.headline.size, fontWeight: '700' },
});
