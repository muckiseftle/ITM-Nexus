import React, { useMemo, useState } from 'react';
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
import { BottomSheet, OptionSheet } from '../components/BottomSheet';
import { INTERVAL_OPTS, WINDOW_OPTS, labelOf, type AppSettings } from '../composition/settings';

interface Props {
  readonly accountName: string;
  readonly accountEmail: string;
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
}

interface Shared {
  readonly id: string;
  readonly name: string;
  readonly addr: string;
}

type Sheet = 'none' | 'interval' | 'window' | 'password';

function initials(name: string): string {
  return name
    .split(/[\s@.]+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

/**
 * Einstellungen (Tab „Mehr"): Konten, App-/Sync-Optionen, Sicherheitsstatus und eine
 * Konto-Detailseite mit Sync-Zeitraum/-Intervall und Verwaltung freigegebener Postfächer —
 * 1:1 zur Web-Vorschau aufgebaut.
 */
export function SettingsScreen({
  accountName,
  accountEmail,
  settings,
  onChangeSettings,
  onSignOut,
  onRemoveAccount,
  onChangePassword,
  onVerifyAppLock,
  onClearCache,
}: Props): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const [cacheBusy, setCacheBusy] = useState(false);

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
              .then(() => Alert.alert('Cache', 'Lokaler Cache geleert — wird neu geladen.'))
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
      'Konto und ALLE lokalen Daten unwiderruflich löschen (Krypto-Shredding)?',
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
  const [shared, setShared] = useState<readonly Shared[]>([]);

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
  const [newName, setNewName] = useState('');
  const [newAddr, setNewAddr] = useState('');

  const pinningActive = PINNING.policies.length > 0;

  const addShared = (): void => {
    const addr = newAddr.trim();
    if (addr.indexOf('@') < 1) {
      Alert.alert('Postfach', 'Bitte eine gültige Adresse eingeben.');
      return;
    }
    const name = newName.trim().length > 0 ? newName.trim() : (addr.split('@')[0] ?? addr);
    setShared((list) => [...list, { id: `s-${String(Date.now())}`, name, addr }]);
    setNewName('');
    setNewAddr('');
    setAdding(false);
  };

  if (route === 'account') {
    return (
      <View style={s.screen}>
        <ScrollView style={s.screen} contentContainerStyle={s.content}>
          <Pressable style={s.back} onPress={() => setRoute('root')} hitSlop={8}>
            <Text style={s.backText}>‹ Einstellungen</Text>
          </Pressable>

          <View style={s.hero}>
            <View style={s.heroAva}>
              <Text style={s.heroAvaText}>{initials(accountName)}</Text>
            </View>
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
            <Pressable onPress={() => setSheet('window')}>
              <Row t={t}>
                <View style={s.grow}>
                  <Text style={s.itemTitle}>Sync-Zeitraum</Text>
                  <Text style={s.itemSub}>Wie weit zurück Mails geladen werden</Text>
                </View>
                <Text style={s.itemValue}>{labelOf(WINDOW_OPTS, settings.syncWindow)}</Text>
                <Text style={s.chev}>›</Text>
              </Row>
            </Pressable>
            <Pressable onPress={() => setSheet('interval')}>
              <Row t={t}>
                <View style={s.grow}>
                  <Text style={s.itemTitle}>Aktualisierung</Text>
                  <Text style={s.itemSub}>Wie oft im Vordergrund synchronisiert wird</Text>
                </View>
                <Text style={s.itemValue}>{labelOf(INTERVAL_OPTS, settings.syncInterval)}</Text>
                <Text style={s.chev}>›</Text>
              </Row>
            </Pressable>
            {onChangePassword !== undefined ? (
              <Pressable onPress={openPasswordSheet}>
                <Row t={t}>
                  <View style={s.grow}>
                    <Text style={s.itemTitle}>Passwort ändern</Text>
                    <Text style={s.itemSub}>Nach Server-seitiger Änderung neu eingeben</Text>
                  </View>
                  <Text style={s.chev}>›</Text>
                </Row>
              </Pressable>
            ) : null}
          </View>

          <Text style={s.section}>Freigegebene Postfächer</Text>
          <View style={s.card}>
            {shared.map((m) => (
              <Row t={t} key={m.id}>
                <View style={s.grow}>
                  <Text style={s.itemTitle}>{m.name}</Text>
                  <Text style={s.itemSub}>{m.addr} · Freigegeben</Text>
                </View>
                <Pressable
                  style={s.rm}
                  onPress={() => setShared((list) => list.filter((x) => x.id !== m.id))}
                >
                  <Text style={s.rmText}>Entfernen</Text>
                </Pressable>
              </Row>
            ))}
            {adding ? (
              <View style={s.addBlock}>
                <TextInput
                  style={s.input}
                  placeholder="Name (optional)"
                  placeholderTextColor={t.c.textSecondary}
                  value={newName}
                  onChangeText={setNewName}
                />
                <TextInput
                  style={s.input}
                  placeholder="postfach@firma.de"
                  placeholderTextColor={t.c.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  value={newAddr}
                  onChangeText={setNewAddr}
                />
                <View style={s.formRow}>
                  <Pressable style={[s.action, s.actionPrimary]} onPress={addShared}>
                    <Text style={s.actionPrimaryText}>Hinzufügen</Text>
                  </Pressable>
                  <Pressable style={s.action} onPress={() => setAdding(false)}>
                    <Text style={s.actionText}>Abbrechen</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable onPress={() => setAdding(true)}>
                <Row t={t}>
                  <Text style={s.addText}>＋ Freigegebenes Postfach hinzufügen</Text>
                </Row>
              </Pressable>
            )}
          </View>

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
                    <Text style={s.chev}>›</Text>
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
        <Pressable onPress={() => setRoute('account')}>
          <Row t={t}>
            <View style={s.miniAva}>
              <Text style={s.miniAvaText}>{initials(accountName)}</Text>
            </View>
            <View style={s.grow}>
              <Text style={s.itemTitle}>{accountName}</Text>
              <Text style={s.itemSub}>{accountEmail}</Text>
            </View>
            <Text style={s.activeTag}>Aktiv</Text>
            <Text style={s.chev}>›</Text>
          </Row>
        </Pressable>
        <Pressable onPress={() => Alert.alert('Konto hinzufügen', 'Demo: nicht verfügbar.')}>
          <Row t={t}>
            <Text style={s.addText}>＋ Konto hinzufügen</Text>
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
    back: { paddingVertical: space.xs },
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
