import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { radius, space, typography } from '@nexus/ui-kit';
import { APP_MODE, PINNING } from '../config';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { BottomSheet, OptionSheet } from '../components/BottomSheet';
import { INTERVAL_OPTS, WINDOW_OPTS, labelOf, type AppSettings } from '../composition/settings';
import type { CacheStats } from '../composition/container';

interface Props {
  readonly accountName: string;
  readonly accountEmail: string;
  /** Alle eingerichteten Konten (Multi-Account). Das aktive ist über {@link accountEmail} bestimmt. */
  readonly accounts: readonly { readonly email: string; readonly name: string }[];
  /** Auf ein anderes Konto umschalten. */
  readonly onSwitchAccount: (email: string) => void;
  /** Neues Konto hinzufügen (öffnet den Login-Fluss). */
  readonly onAddAccount: () => void;
  /** Persistente App-Einstellungen (Sync-Intervall/-Zeitraum). */
  readonly settings: AppSettings;
  /** Einstellungen ändern (sofort wirksam + persistiert). */
  readonly onChangeSettings: (next: AppSettings) => void;
  /** Abmelden: Zugangsdaten verwerfen, zurück zum Login (lokale Daten bleiben). */
  readonly onSignOut: () => void;
  /** Konto entfernen: Krypto-Shredding aller lokalen Daten + zurück zum Login. */
  readonly onRemoveAccount: () => void;
  /** Passwort neu setzen (verifiziert + persistiert). Nur Live-Modus → sonst Zeile ausgeblendet. */
  readonly onChangePassword?: (newPassword: string) => Promise<void>;
  /** Bestätigt die App-Sperre beim Aktivieren per Biometrie. true = bestätigt. Nur Live. */
  readonly onVerifyAppLock?: () => Promise<boolean>;
  /** Lokalen Daten-Cache leeren (DB) ohne Logout — neu laden via Sync. Nur Live-Modus. */
  readonly onClearCache?: () => Promise<void>;
  /** Cache-Statistik (Anzahl + Größe je Datenart). Nur Live-Modus. */
  readonly onGetCacheStats?: () => Promise<CacheStats>;
  /** Kontakte ins iPhone-Adressbuch exportieren (Gruppe „NEXUS"). Liefert die Anzahl. Nur Live. */
  readonly onExportContacts?: () => Promise<number>;
  /** Termine in den iPhone-Kalender „NEXUS" exportieren. Liefert die Anzahl. Nur Live. */
  readonly onExportCalendar?: () => Promise<number>;
  /** Liefert das zuletzt genutzte Mail-Protokoll ('eas'|'ews'|'unbekannt'). Nur Live-Modus. */
  readonly onGetProtocol?: () => Promise<string>;
  /** Freigegebene Postfächer des aktiven Kontos (serverseitig berechtigungsgeprüft). */
  readonly sharedMailboxes: readonly { readonly email: string; readonly displayName: string }[];
  /** Postfach hinzufügen — prüft serverseitig die Berechtigung; wirft bei fehlendem Recht. */
  readonly onAddSharedMailbox?: (email: string) => Promise<void>;
  /** Freigegebenes Postfach wieder entfernen (nur lokale Liste). */
  readonly onRemoveSharedMailbox?: (email: string) => void;
  /** Freigegebenes Postfach öffnen (Nur-Lese-Ansicht des Posteingangs). */
  readonly onOpenSharedMailbox?: (mailbox: {
    readonly email: string;
    readonly displayName: string;
  }) => void;
}

type Sheet = 'none' | 'interval' | 'window' | 'password';

function protocolLabel(p: string): string {
  if (p === 'eas') return 'EAS (ActiveSync)';
  if (p === 'ews') return 'EWS';
  return 'noch kein Sync';
}

/** Bytes menschenlesbar (KB/MB) — für die Cache-Übersicht. */
function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1000) return `${Math.round(bytes / 1000)} KB`;
  return `${bytes} B`;
}

/**
 * Einstellungen (Tab „Mehr"): Konten, App-/Sync-Optionen, Sicherheitsstatus und eine
 * Konto-Detailseite mit Sync-Zeitraum/-Intervall und Verwaltung freigegebener Postfächer —
 * 1:1 zur Web-Vorschau aufgebaut.
 */
export function SettingsScreen({
  accountName,
  accountEmail,
  accounts,
  onSwitchAccount,
  onAddAccount,
  settings,
  onChangeSettings,
  onSignOut,
  onRemoveAccount,
  onChangePassword,
  onVerifyAppLock,
  onClearCache,
  onGetCacheStats,
  onExportContacts,
  onExportCalendar,
  onGetProtocol,
  sharedMailboxes,
  onAddSharedMailbox,
  onRemoveSharedMailbox,
  onOpenSharedMailbox,
}: Props): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const [cacheBusy, setCacheBusy] = useState(false);
  const [protocol, setProtocol] = useState<string | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);

  // Cache-Statistik laden (Anzahl + Größe je Datenart) — bei Bedarf neu abrufen.
  const loadCacheStats = useMemo(
    () => async (): Promise<void> => {
      if (onGetCacheStats === undefined) return;
      try {
        setCacheStats(await onGetCacheStats());
      } catch {
        /* Statistik optional — Fehler still ignorieren. */
      }
    },
    [onGetCacheStats],
  );
  useEffect(() => {
    void loadCacheStats();
  }, [loadCacheStats]);

  // Zuletzt genutztes Mail-Protokoll (EAS/EWS) für die Konto-Detailseite laden.
  useEffect(() => {
    if (onGetProtocol === undefined) return undefined;
    let active = true;
    void onGetProtocol()
      .then((p) => {
        if (active) setProtocol(p);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [onGetProtocol]);

  // Geräte-Export (iPhone-Adressbuch/-Kalender): exportieren + Anzahl rückmelden.
  const [deviceBusy, setDeviceBusy] = useState<'contacts' | 'calendar' | null>(null);
  const runExport = (kind: 'contacts' | 'calendar'): void => {
    const fn = kind === 'contacts' ? onExportContacts : onExportCalendar;
    if (fn === undefined || deviceBusy !== null) return;
    const label = kind === 'contacts' ? 'Kontakte' : 'Termine';
    setDeviceBusy(kind);
    void fn()
      .then((n) =>
        Alert.alert(
          'Auf das iPhone exportiert',
          `${String(n)} ${label} in „NEXUS" auf dem iPhone abgeglichen.`,
        ),
      )
      .catch(() =>
        Alert.alert(
          'Export fehlgeschlagen',
          'Bitte den Zugriff in den iPhone-Einstellungen (Datenschutz) erlauben und erneut versuchen.',
        ),
      )
      .finally(() => setDeviceBusy(null));
  };

  // Lokalen Cache leeren (mit Bestätigung): löscht nur die lokale DB, Login bleibt erhalten.
  const confirmClearCache = (): void => {
    if (onClearCache === undefined) return;
    Alert.alert(
      'Lokalen Cache leeren',
      'Lokal gespeicherte Mails/Ordner verwerfen und neu vom Server laden? Anmeldung bleibt erhalten.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Leeren',
          style: 'destructive',
          onPress: () => {
            setCacheBusy(true);
            void onClearCache()
              .then(() => {
                void loadCacheStats();
                Alert.alert('Cache', 'Lokaler Cache geleert — wird neu geladen.');
              })
              .catch(() => Alert.alert('Cache', 'Konnte nicht geleert werden.'))
              .finally(() => setCacheBusy(false));
          },
        },
      ],
    );
  };

  // App-Sperre umschalten: beim Aktivieren erst per Biometrie bestätigen (nur Live).
  const toggleAppLock = async (value: boolean): Promise<void> => {
    if (value && onVerifyAppLock !== undefined) {
      const ok = await onVerifyAppLock();
      if (!ok) {
        Alert.alert('App-Sperre', 'Aktivierung abgebrochen oder nicht verfügbar.');
        return;
      }
    }
    onChangeSettings({ ...settings, appLock: value });
  };

  const confirmSignOut = (): void => {
    Alert.alert(
      'Abmelden',
      `${accountEmail} abmelden? Lokale Daten bleiben verschlüsselt gespeichert.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Abmelden', style: 'destructive', onPress: onSignOut },
      ],
    );
  };

  const confirmRemove = (): void => {
    Alert.alert(
      'Konto entfernen',
      `${accountEmail} entfernen? Lokale Daten dieses Kontos werden gelöscht; weitere Konten bleiben erhalten.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Entfernen', style: 'destructive', onPress: onRemoveAccount },
      ],
    );
  };

  const [route, setRoute] = useState<'root' | 'account'>('root');
  const [sheet, setSheet] = useState<Sheet>('none');
  const [pw, setPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  const openPasswordSheet = (): void => {
    setPw('');
    setPwError(null);
    setSheet('password');
  };

  const submitPassword = async (): Promise<void> => {
    if (onChangePassword === undefined) return;
    if (pw.length === 0) {
      setPwError('Bitte ein Passwort eingeben.');
      return;
    }
    setPwBusy(true);
    setPwError(null);
    try {
      await onChangePassword(pw);
      setPwBusy(false);
      setSheet('none');
      setPw('');
      Alert.alert('Passwort', 'Passwort erfolgreich aktualisiert.');
    } catch {
      setPwBusy(false);
      setPwError('Anmeldung abgelehnt — bitte Passwort prüfen.');
    }
  };
  const [adding, setAdding] = useState(false);
  const [newAddr, setNewAddr] = useState('');
  const [sharedBusy, setSharedBusy] = useState(false);
  const [sharedError, setSharedError] = useState<string | null>(null);

  const pinningActive = PINNING.policies.length > 0;

  // Postfach hinzufügen: serverseitige Berechtigungsprüfung. Fehlt das Recht, kommt eine klare
  // Meldung und es wird NICHTS hinzugefügt — der Nutzer kann nur Postfächer öffnen, auf die er
  // tatsächlich berechtigt ist.
  const addShared = (): void => {
    if (onAddSharedMailbox === undefined) return;
    const addr = newAddr.trim();
    if (addr.indexOf('@') < 1) {
      setSharedError('Bitte eine gültige Postfach-Adresse eingeben.');
      return;
    }
    setSharedBusy(true);
    setSharedError(null);
    void onAddSharedMailbox(addr)
      .then(() => {
        setNewAddr('');
        setAdding(false);
      })
      .catch((e: unknown) => {
        setSharedError(
          e instanceof Error && e.message.length > 0
            ? e.message
            : 'Postfach konnte nicht geprüft werden.',
        );
      })
      .finally(() => setSharedBusy(false));
  };

  if (route === 'account') {
    return (
      <View style={s.screen}>
        <ScrollView style={s.screen} contentContainerStyle={s.content}>
          <Pressable style={s.back} onPress={() => setRoute('root')} hitSlop={8}>
            <Icon name="chevronLeft" size={20} color={t.c.brandPrimary} />
            <Text style={s.backText}>Einstellungen</Text>
          </Pressable>

          <View style={s.hero}>
            <Avatar name={accountName} colorKey={accountEmail} size={56} />
            <View>
              <Text style={s.heroName}>{accountName}</Text>
              <Text style={s.itemSub}>{accountEmail}</Text>
            </View>
          </View>

          <Text style={s.section}>Konto</Text>
          <View style={s.card}>
            <Row t={t}>
              <View style={s.grow}>
                <Text style={s.itemTitle}>Server</Text>
              </View>
              <Text style={s.itemValue}>{accountEmail.split('@')[1] ?? '—'}</Text>
            </Row>
            {protocol !== null ? (
              <Row t={t}>
                <View style={s.grow}>
                  <Text style={s.itemTitle}>Protokoll</Text>
                  <Text style={s.itemSub}>Aktiver Mail-Connector</Text>
                </View>
                <Text style={s.itemValue}>{protocolLabel(protocol)}</Text>
              </Row>
            ) : null}
            <Pressable onPress={() => setSheet('window')}>
              <Row t={t}>
                <View style={s.grow}>
                  <Text style={s.itemTitle}>Sync-Zeitraum</Text>
                  <Text style={s.itemSub}>Wie weit zurück Mails geladen werden</Text>
                </View>
                <Text style={s.itemValue}>{labelOf(WINDOW_OPTS, settings.syncWindow)}</Text>
                <Icon name="chevronRight" size={18} color={t.c.textSecondary} />
              </Row>
            </Pressable>
            <Pressable onPress={() => setSheet('interval')}>
              <Row t={t}>
                <View style={s.grow}>
                  <Text style={s.itemTitle}>Aktualisierung</Text>
                  <Text style={s.itemSub}>Wie oft im Vordergrund synchronisiert wird</Text>
                </View>
                <Text style={s.itemValue}>{labelOf(INTERVAL_OPTS, settings.syncInterval)}</Text>
                <Icon name="chevronRight" size={18} color={t.c.textSecondary} />
              </Row>
            </Pressable>
            {onChangePassword !== undefined ? (
              <Pressable onPress={openPasswordSheet}>
                <Row t={t}>
                  <View style={s.grow}>
                    <Text style={s.itemTitle}>Passwort ändern</Text>
                    <Text style={s.itemSub}>Nach Server-seitiger Änderung neu eingeben</Text>
                  </View>
                  <Icon name="chevronRight" size={18} color={t.c.textSecondary} />
                </Row>
              </Pressable>
            ) : null}
          </View>

          {onAddSharedMailbox !== undefined ? (
            <>
              <Text style={s.section}>Freigegebene Postfächer</Text>
              <View style={s.card}>
                {sharedMailboxes.map((m) => (
                  <Row t={t} key={m.email}>
                    <Pressable style={s.grow} onPress={() => onOpenSharedMailbox?.(m)}>
                      <Text style={s.itemTitle}>{m.displayName}</Text>
                      <Text style={s.itemSub}>{m.email} · Nur lesen</Text>
                    </Pressable>
                    <Icon name="chevronRight" size={18} color={t.c.textSecondary} />
                    <Pressable style={s.rm} onPress={() => onRemoveSharedMailbox?.(m.email)}>
                      <Text style={s.rmText}>Entfernen</Text>
                    </Pressable>
                  </Row>
                ))}
                {adding ? (
                  <View style={s.addBlock}>
                    <TextInput
                      style={s.input}
                      placeholder="postfach@firma.de"
                      placeholderTextColor={t.c.textSecondary}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      value={newAddr}
                      editable={!sharedBusy}
                      onChangeText={(v) => {
                        setNewAddr(v);
                        setSharedError(null);
                      }}
                    />
                    {sharedError !== null ? <Text style={s.sheetError}>{sharedError}</Text> : null}
                    <View style={s.formRow}>
                      <Pressable
                        style={[s.action, s.actionPrimary, sharedBusy ? s.actionDisabled : null]}
                        disabled={sharedBusy}
                        onPress={addShared}
                      >
                        <Text style={s.actionPrimaryText}>
                          {sharedBusy ? 'Prüfe …' : 'Prüfen & hinzufügen'}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={s.action}
                        onPress={() => {
                          setAdding(false);
                          setSharedError(null);
                        }}
                      >
                        <Text style={s.actionText}>Abbrechen</Text>
                      </Pressable>
                    </View>
                    <Text style={s.itemSub}>
                      Es lassen sich nur Postfächer hinzufügen, für die du auf dem Server berechtigt
                      bist — die Prüfung erfolgt direkt bei Exchange.
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => {
                      setAdding(true);
                      setSharedError(null);
                    }}
                  >
                    <Row t={t}>
                      <Icon name="plus" size={18} color={t.c.brandPrimary} />
                      <Text style={[s.addText, s.addTextSpacer]}>
                        Freigegebenes Postfach hinzufügen
                      </Text>
                    </Row>
                  </Pressable>
                )}
              </View>
            </>
          ) : null}

          {onExportContacts !== undefined || onExportCalendar !== undefined ? (
            <>
              <Text style={s.section}>Mit iPhone synchronisieren</Text>
              <View style={s.card}>
                {onExportContacts !== undefined ? (
                  <Pressable disabled={deviceBusy !== null} onPress={() => runExport('contacts')}>
                    <Row t={t}>
                      <Icon name="contacts" size={20} color={t.c.textSecondary} />
                      <View style={s.grow}>
                        <Text style={s.itemTitle}>Kontakte aufs iPhone exportieren</Text>
                        <Text style={s.itemSub}>In die iPhone-Gruppe „NEXUS" (Adressbuch)</Text>
                      </View>
                      <Text style={s.itemValue}>{deviceBusy === 'contacts' ? 'Läuft …' : ''}</Text>
                      <Icon name="chevronRight" size={18} color={t.c.textSecondary} />
                    </Row>
                  </Pressable>
                ) : null}
                {onExportCalendar !== undefined ? (
                  <Pressable disabled={deviceBusy !== null} onPress={() => runExport('calendar')}>
                    <Row t={t}>
                      <Icon name="calendar" size={20} color={t.c.textSecondary} />
                      <View style={s.grow}>
                        <Text style={s.itemTitle}>Termine aufs iPhone exportieren</Text>
                        <Text style={s.itemSub}>In den iPhone-Kalender „NEXUS"</Text>
                      </View>
                      <Text style={s.itemValue}>{deviceBusy === 'calendar' ? 'Läuft …' : ''}</Text>
                      <Icon name="chevronRight" size={18} color={t.c.textSecondary} />
                    </Row>
                  </Pressable>
                ) : null}
              </View>
              <Text style={s.cacheNote}>
                Beim ersten Mal fragt das iPhone nach Zugriff auf Kontakte/Kalender. Es wird nur die
                NEXUS-eigene Gruppe bzw. der NEXUS-Kalender geschrieben — deine übrigen Kontakte und
                Termine bleiben unangetastet.
              </Text>
            </>
          ) : null}

          {cacheStats !== null ? (
            <>
              <Text style={s.section}>Speicher (lokaler Cache)</Text>
              <View style={s.card}>
                {cacheStats.categories.map((c) => (
                  <Row t={t} key={c.key}>
                    <Text style={s.itemTitle}>{c.label}</Text>
                    <View style={s.grow} />
                    <Text style={s.itemValue}>
                      {c.count} · {formatBytes(c.bytes)}
                    </Text>
                  </Row>
                ))}
                <Row t={t}>
                  <Text style={s.cacheTotal}>Gesamt</Text>
                  <View style={s.grow} />
                  <Text style={s.cacheTotal}>
                    {cacheStats.totalItems} Elemente · {formatBytes(cacheStats.totalBytes)}
                  </Text>
                </Row>
              </View>
              <Text style={s.cacheNote}>
                Gespeichert werden Mail-Texte, Ordner, Kalender und Kontakte. Anhänge und Bilder
                werden bei Bedarf geladen und nicht dauerhaft gespeichert.
              </Text>
            </>
          ) : null}

          {onClearCache !== undefined ? (
            <>
              <Text style={s.section}>Wartung</Text>
              <View style={s.card}>
                <Pressable disabled={cacheBusy} onPress={confirmClearCache}>
                  <Row t={t}>
                    <View style={s.grow}>
                      <Text style={s.itemTitle}>Lokalen Cache leeren</Text>
                      <Text style={s.itemSub}>
                        Lokale Mails verwerfen und neu laden (Login bleibt)
                      </Text>
                    </View>
                    <Text style={s.itemValue}>{cacheBusy ? 'Leere …' : ''}</Text>
                    <Icon name="chevronRight" size={18} color={t.c.textSecondary} />
                  </Row>
                </Pressable>
              </View>
            </>
          ) : null}

          <View style={s.spacer} />
          <View style={s.card}>
            <Pressable onPress={confirmSignOut}>
              <Row t={t}>
                <Text style={s.dangerText}>Abmelden</Text>
              </Row>
            </Pressable>
            <Pressable onPress={confirmRemove}>
              <Row t={t}>
                <Text style={s.dangerText}>Konto entfernen</Text>
              </Row>
            </Pressable>
          </View>
          <View style={s.spacer} />
        </ScrollView>

        <OptionSheet
          visible={sheet === 'window'}
          onClose={() => setSheet('none')}
          title="Sync-Zeitraum"
          options={WINDOW_OPTS}
          selected={settings.syncWindow}
          onSelect={(key) => onChangeSettings({ ...settings, syncWindow: key })}
        />
        <OptionSheet
          visible={sheet === 'interval'}
          onClose={() => setSheet('none')}
          title="Aktualisierung"
          options={INTERVAL_OPTS}
          selected={settings.syncInterval}
          onSelect={(key) => onChangeSettings({ ...settings, syncInterval: key })}
        />
        <BottomSheet
          visible={sheet === 'password'}
          onClose={() => setSheet('none')}
          title="Passwort ändern"
        >
          <Text style={s.sheetHint}>Neues Passwort für {accountEmail}</Text>
          <TextInput
            style={s.input}
            placeholder="Neues Passwort"
            placeholderTextColor={t.c.textSecondary}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={pw}
            onChangeText={setPw}
          />
          {pwError !== null ? <Text style={s.sheetError}>{pwError}</Text> : null}
          <Pressable
            style={[s.pillBtn, pwBusy ? s.pillBtnDisabled : null]}
            disabled={pwBusy}
            onPress={() => void submitPassword()}
          >
            <Text style={s.pillBtnText}>{pwBusy ? 'Prüfe …' : 'Passwort speichern'}</Text>
          </Pressable>
        </BottomSheet>
      </View>
    );
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Text style={s.headTitle}>Einstellungen</Text>

      <Text style={s.section}>Konten</Text>
      <View style={s.card}>
        {accounts.map((a) => {
          const isActive = a.email.toLowerCase() === accountEmail.toLowerCase();
          return (
            <Pressable
              key={a.email}
              onPress={() => (isActive ? setRoute('account') : onSwitchAccount(a.email))}
            >
              <Row t={t}>
                <Avatar name={a.name} colorKey={a.email} size={38} />
                <View style={s.grow}>
                  <Text style={s.itemTitle}>{a.name}</Text>
                  <Text style={s.itemSub}>{a.email}</Text>
                </View>
                {isActive ? <Text style={s.activeTag}>Aktiv</Text> : null}
                <Icon name="chevronRight" size={18} color={t.c.textSecondary} />
              </Row>
            </Pressable>
          );
        })}
        <Pressable onPress={onAddAccount}>
          <Row t={t}>
            <Icon name="plus" size={18} color={t.c.brandPrimary} />
            <Text style={[s.addText, s.addTextSpacer]}>Konto hinzufügen</Text>
          </Row>
        </Pressable>
      </View>

      <Text style={s.section}>App</Text>
      <View style={s.card}>
        <ToggleRow
          t={t}
          title="Push (DirectPush)"
          sub="Neue Mails sofort, ohne Abfrage-Intervall"
          value={settings.push}
          onValueChange={(v) => onChangeSettings({ ...settings, push: v })}
        />
        <ToggleRow
          t={t}
          title="Hintergrund-Aktualisierung"
          sub="Sync auch bei geschlossener App"
          value={settings.background}
          onValueChange={(v) => onChangeSettings({ ...settings, background: v })}
        />
        <ToggleRow
          t={t}
          title="Nur über WLAN synchronisieren"
          value={settings.wifiOnly}
          onValueChange={(v) => onChangeSettings({ ...settings, wifiOnly: v })}
        />
      </View>

      <Text style={s.section}>Sicherheit</Text>
      <View style={s.card}>
        <ToggleRow
          t={t}
          title="App-Sperre (Face ID / Code)"
          sub="Beim Start & nach Hintergrund entsperren"
          value={settings.appLock}
          onValueChange={(v) => void toggleAppLock(v)}
        />
        <Row t={t}>
          <View style={s.grow}>
            <Text style={s.itemTitle}>Zertifikat-Pinning</Text>
            <Text style={s.itemSub}>Nur vertraute Server (fail-closed)</Text>
          </View>
          <Text style={pinningActive ? s.pillOn : s.pillOff}>
            {pinningActive ? 'Aktiv' : 'Inaktiv'}
          </Text>
        </Row>
        <Row t={t}>
          <View style={s.grow}>
            <Text style={s.itemTitle}>Lokale Verschlüsselung</Text>
            <Text style={s.itemSub}>
              {APP_MODE === 'live' ? 'SQLCipher AES-256' : 'Demo (In-Memory)'}
            </Text>
          </View>
          <Text style={APP_MODE === 'live' ? s.pillOn : s.pillOff}>
            {APP_MODE === 'live' ? 'Aktiv' : 'Demo'}
          </Text>
        </Row>
      </View>

      <Text style={s.section}>Über</Text>
      <View style={s.card}>
        <Row t={t}>
          <View style={s.grow}>
            <Text style={s.itemTitle}>Version</Text>
          </View>
          <Text style={s.itemValue}>1.0.0 ({APP_MODE === 'live' ? 'Live' : 'Demo'})</Text>
        </Row>
      </View>
      <View style={s.spacer} />
    </ScrollView>
  );
}

function Row({
  t,
  children,
}: {
  readonly t: AppTheme;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const s = useMemo(() => makeStyles(t), [t]);
  return <View style={s.item}>{children}</View>;
}

function ToggleRow({
  t,
  title,
  sub,
  value,
  onValueChange,
}: {
  readonly t: AppTheme;
  readonly title: string;
  readonly sub?: string;
  readonly value: boolean;
  readonly onValueChange: (v: boolean) => void;
}): React.JSX.Element {
  const s = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={s.item}>
      <View style={s.grow}>
        <Text style={s.itemTitle}>{title}</Text>
        {sub !== undefined ? <Text style={s.itemSub}>{sub}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: t.c.success, false: '#CFD4DA' }}
      />
    </View>
  );
}

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    action: {
      backgroundColor: t.c.bgElevated,
      borderRadius: radius.pill,
      flex: 1,
      padding: space.sm,
    },
    actionDisabled: { opacity: 0.6 },
    actionPrimary: { backgroundColor: t.c.brandPrimary },
    actionPrimaryText: { color: t.onBrand, fontWeight: '700', textAlign: 'center' },
    actionText: { color: t.c.textPrimary, fontWeight: '600', textAlign: 'center' },
    activeTag: {
      backgroundColor: t.c.accent + '1A',
      borderRadius: radius.pill,
      color: t.c.accent,
      fontSize: 11,
      fontWeight: '700',
      overflow: 'hidden',
      paddingHorizontal: space.sm,
      paddingVertical: 3,
    },
    addBlock: { padding: space.md },
    addText: { color: t.c.brandPrimary, fontSize: typography.body.size, fontWeight: '600' },
    addTextSpacer: { marginLeft: space.xs },
    cacheNote: {
      color: t.c.textSecondary,
      fontSize: typography.caption.size,
      marginTop: space.xs,
      paddingHorizontal: space.md,
    },
    cacheTotal: { color: t.c.textPrimary, fontSize: typography.body.size, fontWeight: '700' },
    back: { alignItems: 'center', flexDirection: 'row', gap: 2, paddingVertical: space.xs },
    backText: { color: t.c.brandPrimary, fontSize: typography.body.size },
    card: {
      backgroundColor: t.c.bgElevated,
      borderRadius: radius.md,
      marginHorizontal: space.md,
      overflow: 'hidden',
    },
    chev: { color: t.c.textSecondary, fontSize: typography.body.size },
    content: { paddingBottom: space.xl },
    dangerText: { color: t.c.danger, fontSize: typography.body.size },
    formRow: { flexDirection: 'row', gap: space.xs, marginTop: space.xs },
    grow: { flex: 1, minWidth: 0 },
    headTitle: {
      color: t.c.textPrimary,
      fontSize: typography.title.size,
      fontWeight: '700',
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
    },
    hero: { alignItems: 'center', flexDirection: 'row', gap: space.md, padding: space.md },
    heroAva: {
      alignItems: 'center',
      backgroundColor: t.c.brandPrimary,
      borderRadius: radius.pill,
      height: 56,
      justifyContent: 'center',
      width: 56,
    },
    heroAvaText: { color: t.onBrand, fontSize: typography.headline.size, fontWeight: '700' },
    heroName: { color: t.c.textPrimary, fontSize: typography.headline.size, fontWeight: '700' },
    input: {
      backgroundColor: t.c.bgCanvas,
      borderRadius: radius.sm,
      color: t.c.textPrimary,
      fontSize: typography.body.size,
      marginBottom: space.xs,
      padding: space.sm,
    },
    item: {
      alignItems: 'center',
      borderBottomColor: t.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: space.sm,
      padding: space.md,
    },
    itemSub: { color: t.c.textSecondary, fontSize: typography.caption.size, marginTop: 2 },
    itemTitle: { color: t.c.textPrimary, fontSize: typography.body.size },
    itemValue: { color: t.c.textSecondary, fontSize: typography.body.size },
    miniAva: {
      alignItems: 'center',
      backgroundColor: t.c.brandPrimary,
      borderRadius: radius.pill,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    miniAvaText: { color: t.onBrand, fontSize: typography.caption.size, fontWeight: '700' },
    pillBtn: {
      alignItems: 'center',
      backgroundColor: t.c.brandPrimary,
      borderRadius: radius.pill,
      marginTop: space.sm,
      paddingVertical: 14,
    },
    pillBtnDisabled: { opacity: 0.6 },
    pillBtnText: { color: t.onBrand, fontSize: typography.body.size, fontWeight: '700' },
    pillOff: {
      backgroundColor: t.c.textSecondary + '1A',
      borderRadius: radius.pill,
      color: t.c.textSecondary,
      fontSize: typography.caption.size,
      fontWeight: '700',
      overflow: 'hidden',
      paddingHorizontal: space.sm,
      paddingVertical: 3,
    },
    pillOn: {
      backgroundColor: t.c.success + '1A',
      borderRadius: radius.pill,
      color: t.c.success,
      fontSize: typography.caption.size,
      fontWeight: '700',
      overflow: 'hidden',
      paddingHorizontal: space.sm,
      paddingVertical: 3,
    },
    rm: {
      borderColor: '#E6B9B9',
      borderRadius: radius.pill,
      borderWidth: 1,
      paddingHorizontal: space.md,
      paddingVertical: 6,
    },
    rmText: { color: t.c.danger, fontSize: typography.caption.size, fontWeight: '600' },
    screen: { backgroundColor: t.c.bgCanvas, flex: 1 },
    section: {
      color: t.c.textSecondary,
      fontSize: typography.caption.size,
      fontWeight: '700',
      letterSpacing: 0.5,
      paddingBottom: space.xxs,
      paddingHorizontal: space.md,
      paddingTop: space.lg,
      textTransform: 'uppercase',
    },
    sheetError: { color: t.c.danger, fontSize: typography.caption.size, marginTop: space.xxs },
    sheetHint: {
      color: t.c.textSecondary,
      fontSize: typography.caption.size,
      marginBottom: space.xs,
    },
    spacer: { height: space.lg },
  });
}
