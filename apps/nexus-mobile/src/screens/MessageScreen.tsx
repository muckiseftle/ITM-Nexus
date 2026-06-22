import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type AccountId, type MailMessage, type MessageId } from '@nexus/domain';
import { color, space, typography } from '@nexus/ui-kit';
import type { AppContainer } from '../composition/container';

interface Props {
  readonly container: AppContainer;
  readonly account: AccountId;
  readonly messageId: MessageId;
  readonly onBack: () => void;
}

export function MessageScreen({ container, account, messageId, onBack }: Props): React.JSX.Element {
  const [message, setMessage] = useState<MailMessage | undefined>(undefined);

  useEffect(() => {
    void container.mailStore.getMessage(account, messageId).then(setMessage);
  }, [container, account, messageId]);

  return (
    <View style={styles.container}>
      <Pressable style={styles.back} onPress={onBack}>
        <Text style={styles.backText}>‹ Posteingang</Text>
      </Pressable>
      {message === undefined ? (
        <Text style={styles.meta}>Nachricht nicht gefunden.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.subject}>{message.subject}</Text>
          <Text style={styles.meta}>{message.from.displayName ?? message.from.address}</Text>
          {message.categories.length > 0 ? (
            <Text style={styles.categories}>{message.categories.join(' · ')}</Text>
          ) : null}
          <Text style={styles.body}>{message.body?.content ?? message.preview}</Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  back: { paddingHorizontal: space.md, paddingVertical: space.sm },
  backText: { color: color.brandPrimary, fontSize: typography.body.size },
  body: { color: color.textPrimary, fontSize: typography.body.size, marginTop: space.md },
  categories: { color: color.accent, fontSize: typography.caption.size, marginTop: space.xs },
  container: { backgroundColor: color.bgCanvas, flex: 1 },
  content: { padding: space.md },
  meta: { color: color.textSecondary, fontSize: typography.caption.size, marginTop: space.xs },
  subject: { color: color.textPrimary, fontSize: typography.headline.size, fontWeight: '700' },
});
