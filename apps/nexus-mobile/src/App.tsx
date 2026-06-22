import React, { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { toAccountId, type AccountId, type MessageId } from '@nexus/domain';
import { color, space, typography } from '@nexus/ui-kit';
import { APP_MODE, DEMO_ACCOUNT_ID } from './config';
import { createContainer, type AppContainer } from './composition/container';
import { createDemoContainer } from './composition/demoContainer';
import { LoginScreen } from './screens/LoginScreen';
import { MailboxScreen } from './screens/MailboxScreen';
import { MessageScreen } from './screens/MessageScreen';

type Route =
  | { readonly name: 'mailbox' }
  | { readonly name: 'message'; readonly messageId: MessageId };

/**
 * App-Wurzel mit schlanker State-Navigation (ohne react-navigation). Wählt Demo- oder
 * Live-Container nach `APP_MODE`. Im Live-Modus erscheint zuerst der Login (Punkt 5);
 * im Demo-Modus wird das Demo-Konto direkt geöffnet.
 */
export default function App(): React.JSX.Element {
  const [container, setContainer] = useState<AppContainer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountId | null>(null);
  const [route, setRoute] = useState<Route>({ name: 'mailbox' });

  useEffect(() => {
    const factory = APP_MODE === 'demo' ? createDemoContainer : createContainer;
    factory()
      .then((c) => {
        setContainer(c);
        if (APP_MODE === 'demo') {
          setAccount(toAccountId(DEMO_ACCOUNT_ID));
        }
      })
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

  if (account === null) {
    // Live-Modus, noch nicht angemeldet.
    return (
      <SafeAreaView style={styles.root}>
        <LoginScreen
          container={container}
          onLoggedIn={(accountId) => {
            setAccount(accountId);
            setRoute({ name: 'mailbox' });
          }}
        />
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
          account={account}
          onOpenMessage={(messageId) => {
            setRoute({ name: 'message', messageId });
          }}
        />
      ) : (
        <MessageScreen
          container={container}
          account={account}
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
