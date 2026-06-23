import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import {
  toAccountId,
  toFolderId,
  type AccountId,
  type MailMessage,
  type MessageId,
} from '@nexus/domain';
import { color, space, typography } from '@nexus/ui-kit';
import {
  APP_MODE,
  DEMO_ACCOUNT_ID,
  DEMO_INBOX_ID,
  PUSH_TIMEOUT_MS,
  SYNC_INTERVALS,
} from './config';
import { createContainer, type AppContainer } from './composition/container';
import { createDemoContainer } from './composition/demoContainer';
import { LoginScreen } from './screens/LoginScreen';
import { MailboxScreen } from './screens/MailboxScreen';
import { MessageScreen } from './screens/MessageScreen';
import { ComposerScreen } from './screens/ComposerScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { ContactsScreen } from './screens/ContactsScreen';
import { SearchScreen } from './screens/SearchScreen';

type Tab = 'mail' | 'calendar' | 'contacts' | 'search';

type MailRoute =
  | { readonly name: 'list' }
  | { readonly name: 'message'; readonly messageId: MessageId }
  | { readonly name: 'compose'; readonly replyTo?: MailMessage };

// Demo nutzt die Adresse aus dem Seed; live kommt sie aus dem Login.
const DEMO_EMAIL = 'demo@nexus.local';

const TABS: readonly { readonly key: Tab; readonly label: string }[] = [
  { key: 'mail', label: 'Mail' },
  { key: 'calendar', label: 'Kalender' },
  { key: 'contacts', label: 'Kontakte' },
  { key: 'search', label: 'Suche' },
];

/**
 * App-Wurzel mit schlanker State-Navigation (ohne react-navigation): Tab-Leiste
 * (Mail/Kalender/Kontakte/Suche) plus Mail-Unterrouten (Liste/Nachricht/Verfassen).
 * Wählt Demo- oder Live-Container nach `APP_MODE`; im Live-Modus erscheint zuerst der Login.
 */
export default function App(): React.JSX.Element {
  const [container, setContainer] = useState<AppContainer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountId | null>(null);
  const [accountEmail, setAccountEmail] = useState<string>(DEMO_EMAIL);
  const [tab, setTab] = useState<Tab>('mail');
  const [mailRoute, setMailRoute] = useState<MailRoute>({ name: 'list' });

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

  // Hintergrund-Sync (Vordergrund-Intervall) + DirectPush-Long-Poll, sobald ein Konto offen ist.
  // iOS-BGTaskScheduler für echte Hintergrundausführung folgt on-device; hier deckt das
  // Intervall die aktive Nutzung ab. Im Demo-Modus sind die Server-Calls No-ops.
  useEffect(() => {
    if (container === null || account === null) return;
    let cancelled = false;

    const interval = setInterval(() => {
      void container.backgroundSync.runDue(account);
    }, SYNC_INTERVALS.messages);

    const pushLoop = async (): Promise<void> => {
      const inbox = toFolderId(DEMO_INBOX_ID);
      while (!cancelled && container.push !== undefined) {
        try {
          const result = await container.push.ping(account, [inbox], PUSH_TIMEOUT_MS);
          if (!cancelled) await container.backgroundSync.applyPing(account, result);
        } catch {
          // Verbindung weg/Timeout → kurz warten, dann erneut versuchen (Long-Poll-Resilienz).
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
    };
    void pushLoop();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [container, account]);

  const openMessage = (messageId: MessageId): void => {
    setTab('mail');
    setMailRoute({ name: 'message', messageId });
  };

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
          onLoggedIn={(accountId, email) => {
            setAccount(accountId);
            setAccountEmail(email);
            setTab('mail');
            setMailRoute({ name: 'list' });
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        {tab === 'mail' ? (
          mailRoute.name === 'message' ? (
            <MessageScreen
              container={container}
              account={account}
              messageId={mailRoute.messageId}
              onBack={() => {
                setMailRoute({ name: 'list' });
              }}
              onReply={(message) => {
                setMailRoute({ name: 'compose', replyTo: message });
              }}
            />
          ) : mailRoute.name === 'compose' ? (
            <ComposerScreen
              container={container}
              account={account}
              accountEmail={accountEmail}
              {...(mailRoute.replyTo ? { replyTo: mailRoute.replyTo } : {})}
              onClose={() => {
                setMailRoute({ name: 'list' });
              }}
              onSent={() => {
                setMailRoute({ name: 'list' });
              }}
            />
          ) : (
            <MailboxScreen
              container={container}
              account={account}
              onOpenMessage={openMessage}
              onCompose={() => {
                setMailRoute({ name: 'compose' });
              }}
            />
          )
        ) : tab === 'calendar' ? (
          <CalendarScreen container={container} account={account} />
        ) : tab === 'contacts' ? (
          <ContactsScreen container={container} account={account} />
        ) : (
          <SearchScreen container={container} account={account} onOpenMessage={openMessage} />
        )}
      </View>

      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            style={styles.tab}
            onPress={() => {
              setTab(t.key);
            }}
          >
            <Text style={[styles.tabText, tab === t.key ? styles.tabActive : null]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  centered: {
    alignItems: 'center',
    backgroundColor: color.bgCanvas,
    flex: 1,
    justifyContent: 'center',
  },
  error: { color: color.danger, padding: space.lg, textAlign: 'center' },
  root: { backgroundColor: color.bgCanvas, flex: 1 },
  tab: { alignItems: 'center', flex: 1, paddingVertical: space.sm },
  tabActive: { color: color.brandPrimary, fontWeight: '700' },
  tabBar: {
    borderTopColor: color.bgElevated,
    borderTopWidth: 1,
    flexDirection: 'row',
  },
  tabText: { color: color.textSecondary, fontSize: typography.caption.size },
});
