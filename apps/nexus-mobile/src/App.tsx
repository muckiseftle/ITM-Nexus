import React, { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { color, space, typography } from '@nexus/ui-kit';
import type { MessageId } from '@nexus/domain';
import { APP_MODE } from './config';
import { createContainer, type AppContainer } from './composition/container';
import { createDemoContainer } from './composition/demoContainer';
import { MailboxScreen } from './screens/MailboxScreen';
import { MessageScreen } from './screens/MessageScreen';

type Route =
  | { readonly name: 'mailbox' }
  | { readonly name: 'message'; readonly messageId: MessageId };

/**
 * App-Wurzel mit schlanker State-Navigation (bewusst ohne react-navigation, um native
 * Zusatzabhängigkeiten für den Demo-Build zu vermeiden). Wählt Demo- oder Live-Container
 * nach `APP_MODE` (siehe config.ts).
 */
export default function App(): React.JSX.Element {
  const [container, setContainer] = useState<AppContainer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>({ name: 'mailbox' });

  useEffect(() => {
    const factory = APP_MODE === 'demo' ? createDemoContainer : createContainer;
    factory()
      .then(setContainer)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Initialisierung fehlgeschlagen');
      });
  }, []);

  if (error !== null) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
      </SafeAreaView>
    );
  }

  if (container === null) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={color.brandPrimary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.brand}>NEXUS</Text>
      </View>
      {route.name === 'mailbox' ? (
        <MailboxScreen
          container={container}
          onOpenMessage={(messageId) => {
            setRoute({ name: 'message', messageId });
          }}
        />
      ) : (
        <MessageScreen
          container={container}
          messageId={route.messageId}
          onBack={() => {
            setRoute({ name: 'mailbox' });
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  brand: { color: color.brandPrimary, fontSize: typography.headline.size, fontWeight: '700' },
  centered: {
    alignItems: 'center',
    backgroundColor: color.bgCanvas,
    flex: 1,
    justifyContent: 'center',
  },
  error: { color: color.danger, padding: space.lg, textAlign: 'center' },
  header: {
    borderBottomColor: color.bgElevated,
    borderBottomWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  root: { backgroundColor: color.bgCanvas, flex: 1 },
});
