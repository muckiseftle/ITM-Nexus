import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { toAccountId, type MailMessage } from '@nexus/domain';
import { color, space, typography } from '@nexus/ui-kit';
import type { RootStackParamList } from '../App';
import type { AppContainer } from '../composition/container';

type Props = NativeStackScreenProps<RootStackParamList, 'Message'> & {
  readonly container: AppContainer;
};

const ACCOUNT = toAccountId('primary');

export function MessageScreen({ route, container }: Props): React.JSX.Element {
  const [message, setMessage] = useState<MailMessage | undefined>(undefined);

  useEffect(() => {
    void container.mailStore.getMessage(ACCOUNT, route.params.messageId).then(setMessage);
  }, [container, route.params.messageId]);

  if (message === undefined) {
    return (
      <View style={styles.container}>
        <Text style={styles.meta}>Nachricht nicht gefunden.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.subject}>{message.subject}</Text>
      <Text style={styles.meta}>{message.from.displayName ?? message.from.address}</Text>
      {message.categories.length > 0 ? (
        <Text style={styles.categories}>{message.categories.join(' · ')}</Text>
      ) : null}
      <Text style={styles.body}>{message.body?.content ?? message.preview}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { color: color.textPrimary, fontSize: typography.body.size, marginTop: space.md },
  categories: { color: color.accent, fontSize: typography.caption.size, marginTop: space.xs },
  container: { backgroundColor: color.bgCanvas, flex: 1 },
  content: { padding: space.md },
  meta: { color: color.textSecondary, fontSize: typography.caption.size, marginTop: space.xs },
  subject: { color: color.textPrimary, fontSize: typography.headline.size, fontWeight: '700' },
});
