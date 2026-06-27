import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
import { type StoredAccount } from '@nexus/services';
import { space } from '@nexus/ui-kit';
import { APP_MODE, DEMO_ACCOUNT_ID, DEMO_INBOX_ID, PUSH_TIMEOUT_MS } from './config';
import { createContainer, type AppContainer } from './composition/container';
import { createDemoContainer } from './composition/demoContainer';
import { type SharedMailbox } from './composition/sharedMailboxes';
import { NexusNative } from './native/NexusNative';
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
import { LockScreen } from './components/LockScreen';
import { TabBar } from './components/TabBar';
import { FolderDrawer } from './components/FolderDrawer';
import { LoginScreen } from './screens/LoginScreen';
import { MailboxScreen } from './screens/MailboxScreen';
import { MessageScreen } from './screens/MessageScreen';
import { ComposerScreen, type ComposerInitial } from './screens/ComposerScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { ContactsScreen } from './screens/ContactsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SharedMailboxScreen } from './screens/SharedMailboxScreen';

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
  // App-Sperre (Biometrie): aktiv, solange nicht entsperrt. Nur Live (natives Modul vorhanden).
  const [locked, setLocked] = useState(false);
  // Multi-Account: Registry aller eingerichteten Konten + Flag für den „Konto hinzufügen"-Fluss.
  const [accounts, setAccounts] = useState<readonly StoredAccount[]>([]);
  const [addingAccount, setAddingAccount] = useState(false);
  // Freigegebene Postfächer des aktiven Kontos + die aktuell geöffnete Nur-Lese-Ansicht.
  const [sharedMailboxes, setSharedMailboxes] = useState<readonly SharedMailbox[]>([]);
  const [sharedView, setSharedView] = useState<SharedMailbox | null>(null);

  useEffect(() => {
    const factory = APP_MODE === 'demo' ? createDemoContainer : createContainer;
    factory()
      .then(async (c) => {
        setContainer(c);
        // Persistente Einstellungen laden (Sync-Intervall steuert den Vordergrund-Sync).
        const loaded = await loadSettings(c.secureStore);
        setSettings(loaded);
        // App-Sperre beim Start erzwingen (nur Live — Biometrie braucht das native Modul).
        if (APP_MODE === 'live' && loaded.appLock) setLocked(true);
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

  // Multi-Account: Registry laden (und bei Konto-Wechsel/Hinzufügen/Entfernen aktualisieren).
  useEffect(() => {
    if (container === null) return;
    let active = true;
    void container.setup
      .listAccounts()
      .then((list) => {
        if (active) setAccounts(list);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [container, account]);

  // Freigegebene Postfächer des aktiven Kontos laden (nur Live — Demo hat keine Delegation).
  useEffect(() => {
    const sm = container?.sharedMailboxes;
    if (container === null || account === null || sm === undefined) {
      setSharedMailboxes([]);
      return;
    }
    let active = true;
    void sm
      .list(account)
      .then((list) => {
        if (active) setSharedMailboxes(list);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [container, account]);

  // Hintergrund-Sync (Vordergrund-Intervall) + DirectPush-Long-Poll, sobald ein Konto offen ist.
  useEffect(() => {
    if (container === null || account === null) return;
    const c = container;
    const acc = account;
    let cancelled = false;

    // „Nur über WLAN": auf Mobilfunk wird Sync/Push übersprungen. Ohne nativen Netzwerkstatus
    // (Demo) oder bei deaktivierter Option immer erlaubt. Fehler bei der Abfrage ⇒ erlauben.
    const networkAllowsSync = async (): Promise<boolean> => {
      if (!settings.wifiOnly || c.networkStatus === undefined) return true;
      const status = await c.networkStatus().catch(() => 'wifi');
      return status !== 'cellular';
    };

    // Ein Sync-Durchlauf; signalisiert den Screens per syncTick, lokal neu zu laden.
    const runSync = async (): Promise<void> => {
      if (!(await networkAllowsSync())) return;
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

    // iOS-Hintergrund-Sync nur planen, wenn der Schalter „Hintergrund-Aktualisierung" an ist.
    if (settings.background) void c.scheduleBackgroundSync?.();

    // Abbrechbarer Backoff-Timer für die Push-Schleife (wird beim Unmount geleert).
    let pushDelayTimer: ReturnType<typeof setTimeout> | undefined;
    const pushLoop = async (): Promise<void> => {
      const inbox = toFolderId(DEMO_INBOX_ID);
      let failures = 0;
      while (!cancelled && c.push !== undefined) {
        // „Nur über WLAN": auf Mobilfunk nicht pollen, kurz warten und erneut prüfen.
        if (!(await networkAllowsSync())) {
          await new Promise<void>((resolve) => {
            pushDelayTimer = setTimeout(resolve, 30_000);
          });
          continue;
        }
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
    // DirectPush-Long-Poll nur starten, wenn der Schalter „Push" an ist.
    if (settings.push) void pushLoop();

    return () => {
      cancelled = true;
      if (interval !== undefined) clearInterval(interval);
      if (pushDelayTimer !== undefined) clearTimeout(pushDelayTimer);
    };
  }, [
    container,
    account,
    settings.syncInterval,
    settings.push,
    settings.background,
    settings.wifiOnly,
  ]);

  // App-Sperre nach echter Rückkehr aus dem Hintergrund erneut erzwingen (nur Live).
  const appLockRef = useRef(settings.appLock);
  appLockRef.current = settings.appLock;
  useEffect(() => {
    if (APP_MODE !== 'live') return;
    let prev = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      if (prev === 'background' && next === 'active' && appLockRef.current) setLocked(true);
      prev = next;
    });
    return () => sub.remove();
  }, []);

  // Einstellungen ändern → sofort wirksam (State) und persistieren (SecureStore).
  const updateSettings = useCallback(
    (next: AppSettings) => {
      setSettings(next);
      if (container !== null) void saveSettings(container.secureStore, next);
    },
    [container],
  );

  // Bestätigt die App-Sperre beim Aktivieren per Biometrie/Code (nur Live). true = bestätigt.
  const verifyAppLock = useMemo(
    () =>
      APP_MODE === 'live'
        ? async (): Promise<boolean> => {
            try {
              await NexusNative.biometricAuthenticate('App-Sperre aktivieren');
              return true;
            } catch {
              return false;
            }
          }
        : undefined,
    [],
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

  // Lokalen Cache leeren (nur Live): DB leeren + leer neu aufbauen, danach Screens neu laden.
  // Zugangsdaten/Login bleiben — der Sync füllt die Mails erneut.
  const clearCache = useMemo(
    () =>
      APP_MODE === 'live' && container !== null
        ? async (): Promise<void> => {
            await container.clearCache?.();
            setFolders([]);
            setSyncTick((x) => x + 1);
          }
        : undefined,
    [container],
  );

  const accountName = useMemo(() => deriveName(accountEmail), [accountEmail]);
  // Anzeige-Liste der Konten für die Einstellungen: Registry + sicherstellen, dass das aktive
  // Konto enthalten ist (im Demo-Modus ist die Registry leer, das aktive Konto existiert dennoch).
  const accountList = useMemo(() => {
    const list = accounts.map((a) => ({ email: a.email, name: deriveName(a.email) }));
    if (
      account !== null &&
      !list.some((a) => a.email.toLowerCase() === accountEmail.toLowerCase())
    ) {
      list.unshift({ email: accountEmail, name: accountName });
    }
    return list;
  }, [accounts, account, accountEmail, accountName]);
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
    setSharedView(null);
  }, []);

  // Aktives Konto umschalten (Multi-Account): Zeiger + Transport-Restore, dann UI auf das
  // Zielkonto umstellen. Die Datenschicht ist kontogetrennt → Screens zeigen automatisch die
  // richtigen Daten; ein syncTick stößt das Neuladen an.
  const switchAccount = useCallback(
    async (email: string): Promise<void> => {
      const c = container;
      if (c === null) return;
      await Promise.resolve(c.switchAccount?.(email)).catch(() => undefined);
      setAccount(toAccountId(email.toLowerCase()));
      setAccountEmail(email);
      setTab('mail');
      setMailRoute({ name: 'list' });
      setDrawerOpen(false);
      setFolders([]);
      setCurrentFolder(toFolderId(DEMO_INBOX_ID));
      setSharedView(null);
      setSyncTick((x) => x + 1);
    },
    [container],
  );

  // Abmelden: aktives Konto vergessen (kein Auto-Restore mehr). Gibt es weitere Konten, wird
  // auf eines davon umgeschaltet; sonst zurück zum Login. Lokale Daten bleiben.
  const signOut = useCallback((): void => {
    const c = container;
    if (c === null || account === null) {
      resetToLogin();
      return;
    }
    const current = accountEmail;
    void (async () => {
      await c.setup.forget(current).catch(() => undefined);
      const remaining = await c.setup.listAccounts().catch(() => [] as readonly StoredAccount[]);
      const [next] = remaining;
      if (next !== undefined) await switchAccount(next.email);
      else resetToLogin();
    })();
  }, [container, account, accountEmail, resetToLogin, switchAccount]);

  // Konto entfernen: Daten DIESES Kontos löschen (DB-Inhalte) + Zugangsdaten vergessen. Gibt es
  // weitere Konten, auf eines umschalten; ist es das letzte, alles per Krypto-Shredding löschen.
  const removeAccount = useCallback((): void => {
    const c = container;
    if (c === null || account === null) {
      resetToLogin();
      return;
    }
    const current = accountEmail;
    const currentId = account;
    void (async () => {
      await Promise.resolve(c.purgeAccount?.(currentId)).catch(() => undefined);
      await c.setup.forget(current).catch(() => undefined);
      const remaining = await c.setup.listAccounts().catch(() => [] as readonly StoredAccount[]);
      const [next] = remaining;
      if (next !== undefined) {
        await switchAccount(next.email);
      } else {
        await c.secureStore.wipe().catch(() => undefined);
        resetToLogin();
      }
    })();
  }, [container, account, accountEmail, resetToLogin, switchAccount]);

  // Konto hinzufügen: den Login-Fluss als Overlay öffnen (ohne das aktive Konto zu verwerfen).
  const addAccount = useCallback((): void => setAddingAccount(true), []);

  // Freigegebenes Postfach hinzufügen — serverseitig berechtigungsgeprüft. Wirft bei fehlender
  // Berechtigung (SharedMailboxError 'forbidden'); die SettingsScreen-UI zeigt die Meldung an.
  const addSharedMailbox = useCallback(
    async (email: string): Promise<void> => {
      const c = container;
      const sm = c?.sharedMailboxes;
      if (c === null || account === null || sm === undefined) return;
      await sm.add(account, email);
      setSharedMailboxes(await sm.list(account));
    },
    [container, account],
  );
  const removeSharedMailbox = useCallback(
    (email: string): void => {
      const c = container;
      const sm = c?.sharedMailboxes;
      if (c === null || account === null || sm === undefined) return;
      void sm
        .remove(account, email)
        .then(() => sm.list(account))
        .then(setSharedMailboxes)
        .catch(() => undefined);
    },
    [container, account],
  );
  const openSharedMailbox = useCallback(
    (mailbox: SharedMailbox): void => setSharedView(mailbox),
    [],
  );

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

  if (locked) {
    return (
      <SafeAreaView style={s.root}>
        <StatusBar
          translucent
          backgroundColor="transparent"
          barStyle={t.mode === 'dark' ? 'light-content' : 'dark-content'}
        />
        <LockScreen onUnlock={() => setLocked(false)} />
      </SafeAreaView>
    );
  }

  // Multi-Account: „Konto hinzufügen" zeigt den Login-Fluss als Overlay über dem aktiven Konto.
  // Nach erfolgreichem Setup ist das neue Konto bereits aktiv (current-account + Transport).
  if (addingAccount && account !== null) {
    return (
      <SafeAreaView style={s.root}>
        <LoginScreen
          container={container}
          onCancel={() => setAddingAccount(false)}
          onLoggedIn={(accountId, email) => {
            setAddingAccount(false);
            setAccount(accountId);
            setAccountEmail(email);
            setTab('mail');
            setMailRoute({ name: 'list' });
            setFolders([]);
            setCurrentFolder(toFolderId(DEMO_INBOX_ID));
            setSyncTick((x) => x + 1);
          }}
        />
      </SafeAreaView>
    );
  }

  // Nur-Lese-Ansicht eines freigegebenen Postfachs als Overlay über dem aktiven Konto.
  if (sharedView !== null && account !== null) {
    return (
      <SafeAreaView style={s.root}>
        <StatusBar
          translucent
          backgroundColor="transparent"
          barStyle={t.mode === 'dark' ? 'light-content' : 'dark-content'}
        />
        <SharedMailboxScreen
          container={container}
          account={account}
          email={sharedView.email}
          displayName={sharedView.displayName}
          onBack={() => setSharedView(null)}
        />
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
            accounts={accountList}
            onSwitchAccount={(email) => void switchAccount(email)}
            onAddAccount={addAccount}
            sharedMailboxes={sharedMailboxes}
            settings={settings}
            onChangeSettings={updateSettings}
            onSignOut={signOut}
            onRemoveAccount={removeAccount}
            {...(container.sharedMailboxes !== undefined
              ? {
                  onAddSharedMailbox: addSharedMailbox,
                  onRemoveSharedMailbox: removeSharedMailbox,
                  onOpenSharedMailbox: openSharedMailbox,
                }
              : {})}
            {...(changePassword !== undefined ? { onChangePassword: changePassword } : {})}
            {...(verifyAppLock !== undefined ? { onVerifyAppLock: verifyAppLock } : {})}
            {...(clearCache !== undefined ? { onClearCache: clearCache } : {})}
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
