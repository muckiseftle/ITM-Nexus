import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
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
import { APP_MODE, DEMO_ACCOUNT_ID, DEMO_INBOX_ID, PUSH_TIMEOUT_MS } from './config';
import { createContainer, type AppContainer } from './composition/container';
import { createDemoContainer } from './composition/demoContainer';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  syncIntervalMs,
  type AppSettings,
} from './composition/settings';
import { ThemeProvider, useTheme, type AppTheme } from './theme/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { type IconName } from './components/Icon';
import { TabBar } from './components/TabBar';
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
  // Solange wir im Live-Modus eine evtl. vorhandene Sitzung wiederherstellen, KEIN Login
  // zeigen (sonst blitzt das Anmelde-Fenster kurz auf, bevor die Mailseite erscheint).
  const [restoring, setRestoring] = useState<boolean>(APP_MODE !== 'demo');
  const [account, setAccount] = useState<AccountId | null>(null);
  const [accountEmail, setAccountEmail] = useState<string>(DEMO_EMAIL);
  const [tab, setTab] = useState<Tab>('mail');
  const [mailRoute, setMailRoute] = useState<MailRoute>({ name: 'list' });
  const [currentFolder, setCurrentFolder] = useState<FolderId>(toFolderId(DEMO_INBOX_ID));
  const [folders, setFolders] = useState<readonly MailFolder[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Wird nach jedem erfolgreichen Hintergrund-Sync erhöht → Screens laden lokal neu.
  const [syncTick, setSyncTick] = useState(0);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const factory = APP_MODE === 'demo' ? createDemoContainer : createContainer;
    factory()
      .then(async (c) => {
        setContainer(c);
        // Persistente Einstellungen laden (Sync-Intervall steuert den Vordergrund-Sync).
        setSettings(await loadSettings(c.secureStore));
        if (APP_MODE === 'demo') {
          setAccount(toAccountId(DEMO_ACCOUNT_ID));
          setRestoring(false);
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
        } finally {
          setRestoring(false);
        }
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Initialisierung fehlgeschlagen');
        setRestoring(false);
      });
  }, []);

  // Ordnerstruktur für das Schubfach laden (und bei Konto-/Sync-Wechsel aktualisieren).
  useEffect(() => {
    if (container === null || account === null) return;
    void container.folders
      .listFolders(account)
      .then(setFolders)
      .catch(() => undefined);
  }, [container, account]);

  // Hintergrund-Sync (Vordergrund-Intervall) + DirectPush-Long-Poll, sobald ein Konto offen ist.
  useEffect(() => {
    if (container === null || account === null) return;
    const c = container;
    const acc = account;
    let cancelled = false;

    // Ein Sync-Durchlauf; signalisiert den Screens per syncTick, lokal neu zu laden.
    const runSync = async (): Promise<void> => {
      try {
        await c.backgroundSync.runDue(acc);
        if (!cancelled) setSyncTick((x) => x + 1);
      } catch (e: unknown) {
        if (!cancelled && classifyError(e).kind === 'auth') authExpiredRef.current();
      }
    };

    // SOFORT einmal synchronisieren (nicht erst nach dem Intervall) → Mails erscheinen zügig.
    void runSync();
    // Poll-Intervall aus den Einstellungen; `null` = Manuell → kein Timer (nur Push + Initial-Sync).
    const periodMs = syncIntervalMs(settings.syncInterval);
    const interval = periodMs !== null ? setInterval(() => void runSync(), periodMs) : undefined;

    void c.scheduleBackgroundSync?.();

    // Abbrechbarer Backoff-Timer für die Push-Schleife (wird beim Unmount geleert).
    let pushDelayTimer: ReturnType<typeof setTimeout> | undefined;
    const pushLoop = async (): Promise<void> => {
      const inbox = toFolderId(DEMO_INBOX_ID);
      let failures = 0;
      while (!cancelled && c.push !== undefined) {
        try {
          const result = await c.push.ping(acc, [inbox], PUSH_TIMEOUT_MS);
          failures = 0;
          if (!cancelled) {
            await c.backgroundSync.applyPing(acc, result);
            setSyncTick((x) => x + 1);
          }
        } catch (e: unknown) {
          // Auth-Fehler → Long-Poll beenden (Login-Screen erscheint), nicht endlos weiterpollen.
          if (classifyError(e).kind === 'auth') {
            if (!cancelled) authExpiredRef.current();
            break;
          }
          // Exponentielles Backoff (5 s … 2 min) statt Tight-Spin, falls ping sofort fehlschlägt.
          failures += 1;
          const delayMs = Math.min(5000 * 2 ** Math.min(failures - 1, 5), 120_000);
          await new Promise<void>((resolve) => {
            pushDelayTimer = setTimeout(resolve, delayMs);
          });
        }
      }
    };
    void pushLoop();

    return () => {
      cancelled = true;
      if (interval !== undefined) clearInterval(interval);
      if (pushDelayTimer !== undefined) clearTimeout(pushDelayTimer);
    };
  }, [container, account, settings.syncInterval]);

  // Einstellungen ändern → sofort wirksam (State) und persistieren (SecureStore).
  const updateSettings = useCallback(
    (next: AppSettings) => {
      setSettings(next);
      if (container !== null) void saveSettings(container.secureStore, next);
    },
    [container],
  );

  // Passwort neu setzen (nach Server-seitiger Änderung): verifizieren + im Keychain aktualisieren.
  // Nur im Live-Modus verfügbar; Demo zeigt die Zeile nicht.
  const changePassword = useMemo(
    () =>
      APP_MODE === 'live' && container !== null
        ? (newPassword: string): Promise<void> =>
            container.setup.updatePassword(accountEmail, newPassword)
        : undefined,
    [container, accountEmail],
  );

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

  if (container === null || restoring) {
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
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={t.mode === 'dark' ? 'light-content' : 'dark-content'}
      />
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
              syncSignal={syncTick}
              onOpenMessage={openMessage}
              onAuthExpired={handleAuthExpired}
              onOpenDrawer={() => {
                void container.folders
                  .listFolders(account)
                  .then(setFolders)
                  .catch(() => undefined);
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
            settings={settings}
            onChangeSettings={updateSettings}
            onSignOut={signOut}
            onRemoveAccount={removeAccount}
            {...(changePassword !== undefined ? { onChangePassword: changePassword } : {})}
          />
        )}
      </View>

      <TabBar tabs={TABS} active={tab} onSelect={setTab} />

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
  });
}
