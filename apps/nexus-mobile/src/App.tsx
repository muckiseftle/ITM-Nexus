import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import {
  buildComposePrefill,
  createMailAddress,
  formatAddressList,
  toAccountId,
  toFolderId,
  type AccountId,
  type FolderId,
  type MailFolder,
  type MailMessage,
  type MessageId,
  type ReplyMode,
} from '@nexus/domain';
import { classifyError } from '@nexus/core-transport';
import { space } from '@nexus/ui-kit';
import {
  APP_MODE,
  DEMO_ACCOUNT_ID,
  DEMO_INBOX_ID,
  PUSH_TIMEOUT_MS,
  SYNC_INTERVALS,
} from './config';
import { createContainer, type AppContainer } from './composition/container';
import { createDemoContainer } from './composition/demoContainer';
import { ThemeProvider, useTheme, type AppTheme } from './theme/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Icon, type IconName } from './components/Icon';
import { FolderDrawer } from './components/FolderDrawer';
import { LoginScreen } from './screens/LoginScreen';
import { MailboxScreen } from './screens/MailboxScreen';
import { MessageScreen } from './screens/MessageScreen';
import { ComposerScreen, type ComposerInitial } from './screens/ComposerScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { ContactsScreen } from './screens/ContactsScreen';
import { SettingsScreen } from './screens/SettingsScreen';

type Tab = 'mail' | 'calendar' | 'contacts' | 'settings';

type MailRoute =
  | { readonly name: 'list' }
  | { readonly name: 'message'; readonly messageId: MessageId }
  | { readonly name: 'compose'; readonly initial?: ComposerInitial };

const DEMO_EMAIL = 'demo@nexus.local';

const COMPOSE_TITLES: Readonly<Record<ReplyMode, string>> = {
  reply: 'Antworten',
  replyAll: 'Allen antworten',
  forward: 'Weiterleiten',
};

/** Baut die Composer-Vorbelegung (An/Cc/Betreff/Zitat) aus einer Nachricht + Antwort-Art. */
function composerInitialFor(
  mode: ReplyMode,
  message: MailMessage,
  selfEmail: string,
): ComposerInitial {
  const self = createMailAddress(selfEmail);
  const p = buildComposePrefill(message, mode, self);
  return {
    to: formatAddressList(p.to),
    cc: formatAddressList(p.cc),
    subject: p.subject,
    body: p.body,
    title: COMPOSE_TITLES[mode],
    ...(p.inReplyTo !== undefined ? { inReplyTo: p.inReplyTo } : {}),
  };
}

const TABS: readonly { readonly key: Tab; readonly label: string; readonly icon: IconName }[] = [
  { key: 'mail', label: 'Mail', icon: 'mail' },
  { key: 'calendar', label: 'Kalender', icon: 'calendar' },
  { key: 'contacts', label: 'Kontakte', icon: 'contacts' },
  { key: 'settings', label: 'Mehr', icon: 'more' },
];

function deriveName(email: string): string {
  if (APP_MODE === 'demo') return 'NEXUS Demo';
  const local = email.split('@')[0] ?? email;
  return local
    .split(/[._-]+/)
    .map((p) => (p.length > 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join(' ');
}

export default function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <AppInner />
      </ErrorBoundary>
    </ThemeProvider>
  );
}

/**
 * App-Wurzel mit schlanker State-Navigation (ohne react-navigation): Icon-Tableiste
 * (Mail/Kalender/Kontakte/Mehr) plus Mail-Unterrouten (Liste/Nachricht/Verfassen) und einem
 * seitlichen Ordner-Schubfach. Wählt Demo- oder Live-Container nach `APP_MODE`.
 */
function AppInner(): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  const [container, setContainer] = useState<AppContainer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountId | null>(null);
  const [accountEmail, setAccountEmail] = useState<string>(DEMO_EMAIL);
  const [tab, setTab] = useState<Tab>('mail');
  const [mailRoute, setMailRoute] = useState<MailRoute>({ name: 'list' });
  const [currentFolder, setCurrentFolder] = useState<FolderId>(toFolderId(DEMO_INBOX_ID));
  const [folders, setFolders] = useState<readonly MailFolder[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const factory = APP_MODE === 'demo' ? createDemoContainer : createContainer;
    factory()
      .then(async (c) => {
        setContainer(c);
        if (APP_MODE === 'demo') {
          setAccount(toAccountId(DEMO_ACCOUNT_ID));
          return;
        }
        // Live: bestehende Sitzung aus dem Keychain wiederherstellen → kein erneuter Login
        // bei jedem App-Start. Fehler hier sind unkritisch → normaler Login-Screen.
        try {
          const restored = await c.restoreSession?.();
          if (restored !== null && restored !== undefined && restored.length > 0) {
            setAccount(toAccountId(restored.toLowerCase()));
            setAccountEmail(restored);
          }
        } catch {
          /* kein Restore möglich → Login-Screen */
        }
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Initialisierung fehlgeschlagen');
      });
  }, []);

  // Ordnerstruktur für das Schubfach laden (und bei Konto-/Sync-Wechsel aktualisieren).
  useEffect(() => {
    if (container === null || account === null) return;
    void container.folders.listFolders(account).then(setFolders);
  }, [container, account]);

  // Hintergrund-Sync (Vordergrund-Intervall) + DirectPush-Long-Poll, sobald ein Konto offen ist.
  useEffect(() => {
    if (container === null || account === null) return;
    let cancelled = false;

    const interval = setInterval(() => {
      // Fehler im Hintergrund-Sync NIE als unbehandelte Rejection durchschlagen lassen.
      container.backgroundSync.runDue(account).catch((e: unknown) => {
        if (classifyError(e).kind === 'auth') authExpiredRef.current();
      });
    }, SYNC_INTERVALS.messages);

    void container.scheduleBackgroundSync?.();

    const pushLoop = async (): Promise<void> => {
      const inbox = toFolderId(DEMO_INBOX_ID);
      while (!cancelled && container.push !== undefined) {
        try {
          const result = await container.push.ping(account, [inbox], PUSH_TIMEOUT_MS);
          if (!cancelled) await container.backgroundSync.applyPing(account, result);
        } catch {
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

  const accountName = useMemo(() => deriveName(accountEmail), [accountEmail]);
  const folderName = useMemo(
    () => folders.find((f) => f.id === currentFolder)?.displayName ?? 'Posteingang',
    [folders, currentFolder],
  );

  const openMessage = (messageId: MessageId): void => {
    setTab('mail');
    setMailRoute({ name: 'message', messageId });
  };

  // Konto-Lebenszyklus: UI auf den Login-Zustand zurücksetzen.
  const resetToLogin = useCallback((): void => {
    setAccount(null);
    setAccountEmail(DEMO_EMAIL);
    setTab('mail');
    setMailRoute({ name: 'list' });
    setDrawerOpen(false);
    setFolders([]);
    setCurrentFolder(toFolderId(DEMO_INBOX_ID));
  }, []);

  // Abmelden: Zugangsdaten verwerfen (kein Auto-Restore mehr), lokale Daten bleiben.
  const signOut = useCallback((): void => {
    const c = container;
    if (c !== null && account !== null) {
      void c.setup.forget(accountEmail).catch(() => undefined);
    }
    resetToLogin();
  }, [container, account, accountEmail, resetToLogin]);

  // Konto entfernen: Krypto-Shredding ALLER lokalen Daten (DB-Key + Secrets) + Login.
  const removeAccount = useCallback((): void => {
    const c = container;
    if (c !== null) {
      void c.secureStore.wipe().catch(() => undefined);
    }
    resetToLogin();
  }, [container, resetToLogin]);

  // Abgelaufene/abgelehnte Anmeldung (401) → automatisch abmelden, zurück zum Login.
  const handleAuthExpired = useCallback((): void => {
    signOut();
  }, [signOut]);

  // Ref, damit der Hintergrund-Sync-Effekt nicht bei jeder Handler-Neubildung neu startet.
  const authExpiredRef = useRef(handleAuthExpired);
  authExpiredRef.current = handleAuthExpired;

  if (error !== null) {
    return (
      <SafeAreaView style={s.centered}>
        <Text style={s.error}>{error}</Text>
      </SafeAreaView>
    );
  }

  if (container === null) {
    return (
      <SafeAreaView style={s.centered}>
        <ActivityIndicator color={t.c.brandPrimary} />
      </SafeAreaView>
    );
  }

  if (account === null) {
    return (
      <SafeAreaView style={s.root}>
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
    <SafeAreaView style={s.root}>
      <View style={s.body}>
        {tab === 'mail' ? (
          mailRoute.name === 'message' ? (
            <MessageScreen
              container={container}
              account={account}
              messageId={mailRoute.messageId}
              backLabel={folderName}
              onBack={() => {
                setMailRoute({ name: 'list' });
              }}
              onCompose={(mode, message) => {
                setMailRoute({
                  name: 'compose',
                  initial: composerInitialFor(mode, message, accountEmail),
                });
              }}
            />
          ) : mailRoute.name === 'compose' ? (
            <ComposerScreen
              container={container}
              account={account}
              accountEmail={accountEmail}
              {...(mailRoute.initial ? { initial: mailRoute.initial } : {})}
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
              folderId={currentFolder}
              folderTitle={folderName}
              onOpenMessage={openMessage}
              onAuthExpired={handleAuthExpired}
              onOpenDrawer={() => {
                void container.folders.listFolders(account).then(setFolders);
                setDrawerOpen(true);
              }}
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
          <SettingsScreen
            accountName={accountName}
            accountEmail={accountEmail}
            onSignOut={signOut}
            onRemoveAccount={removeAccount}
          />
        )}
      </View>

      <View style={s.tabBar}>
        {TABS.map((tabDef) => {
          const active = tab === tabDef.key;
          const tint = active ? t.c.brandPrimary : t.c.textSecondary;
          return (
            <Pressable
              key={tabDef.key}
              style={s.tab}
              onPress={() => {
                setTab(tabDef.key);
              }}
            >
              <Icon name={tabDef.icon} size={24} color={tint} />
              <Text style={[s.tabText, { color: tint }, active ? s.tabActive : null]}>
                {tabDef.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FolderDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        accountName={accountName}
        accountEmail={accountEmail}
        folders={folders}
        currentFolderId={currentFolder}
        onSelectFolder={(id) => {
          setCurrentFolder(id);
          setMailRoute({ name: 'list' });
          setDrawerOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    body: { flex: 1 },
    centered: {
      alignItems: 'center',
      backgroundColor: t.c.bgCanvas,
      flex: 1,
      justifyContent: 'center',
    },
    error: { color: t.c.danger, padding: space.lg, textAlign: 'center' },
    root: { backgroundColor: t.c.bgCanvas, flex: 1 },
    tab: { alignItems: 'center', flex: 1, gap: 2, paddingVertical: space.xs },
    tabActive: { fontWeight: '700' },
    tabBar: {
      backgroundColor: t.c.bgCanvas,
      borderTopColor: t.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
    },
    tabText: { fontSize: 10 },
  });
}
