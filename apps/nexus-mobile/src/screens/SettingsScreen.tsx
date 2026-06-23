import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { radius, space, typography } from '@nexus/ui-kit';
import { APP_MODE, PINNING } from '../config';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface Props {
  readonly accountName: string;
  readonly accountEmail: string;
}

interface Shared {
  readonly id: string;
  readonly name: string;
  readonly addr: string;
}

const WINDOW_OPTS = [
  { key: '1w', label: '1 Woche' },
  { key: '1m', label: '1 Monat' },
  { key: '3m', label: '3 Monate' },
  { key: '6m', label: '6 Monate' },
  { key: 'all', label: 'Alle Nachrichten' },
] as const;

const INTERVAL_OPTS = [
  { key: '1m', label: 'Alle 1 Minute' },
  { key: '5m', label: 'Alle 5 Minuten' },
  { key: '15m', label: 'Alle 15 Minuten' },
  { key: 'manual', label: 'Manuell' },
] as const;

function nextKey<T extends { readonly key: string }>(opts: readonly T[], current: string): string {
  const i = opts.findIndex((o) => o.key === current);
  return opts[(i + 1) % opts.length]?.key ?? current;
}

function labelOf(opts: readonly { readonly key: string; readonly label: string }[], key: string): string {
  return opts.find((o) => o.key === key)?.label ?? key;
}

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
export function SettingsScreen({ accountName, accountEmail }: Props): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  const [route, setRoute] = useState<'root' | 'account'>('root');
  const [push, setPush] = useState(true);
  const [background, setBackground] = useState(true);
  const [wifiOnly, setWifiOnly] = useState(false);
  const [appLock, setAppLock] = useState(true);
  const [syncWindow, setSyncWindow] = useState<string>('1m');
  const [syncInterval, setSyncInterval] = useState<string>('5m');
  const [shared, setShared] = useState<readonly Shared[]>([]);
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
          <Pressable onPress={() => setSyncWindow((v) => nextKey(WINDOW_OPTS, v))}>
            <Row t={t}>
              <View style={s.grow}>
                <Text style={s.itemTitle}>Sync-Zeitraum</Text>
                <Text style={s.itemSub}>Wie weit zurück Mails geladen werden</Text>
              </View>
              <Text style={s.itemValue}>{labelOf(WINDOW_OPTS, syncWindow)}</Text>
              <Text style={s.chev}>›</Text>
            </Row>
          </Pressable>
          <Pressable onPress={() => setSyncInterval((v) => nextKey(INTERVAL_OPTS, v))}>
            <Row t={t}>
              <View style={s.grow}>
                <Text style={s.itemTitle}>Aktualisierung</Text>
              </View>
              <Text style={s.itemValue}>{labelOf(INTERVAL_OPTS, syncInterval)}</Text>
              <Text style={s.chev}>›</Text>
            </Row>
          </Pressable>
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

        <View style={s.spacer} />
        <View style={s.card}>
          <Pressable onPress={() => Alert.alert('Abmelden', 'Demo: abgemeldet.')}>
            <Row t={t}>
              <Text style={s.dangerText}>Abmelden</Text>
            </Row>
          </Pressable>
          <Pressable onPress={() => Alert.alert('Konto entfernen', 'Demo: Konto entfernt.')}>
            <Row t={t}>
              <Text style={s.dangerText}>Konto entfernen</Text>
            </Row>
          </Pressable>
        </View>
        <View style={s.spacer} />
      </ScrollView>
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
        <ToggleRow t={t} title="Push (DirectPush)" sub="Neue Mails sofort, ohne Abfrage-Intervall" value={push} onValueChange={setPush} />
        <ToggleRow t={t} title="Hintergrund-Aktualisierung" sub="Sync auch bei geschlossener App" value={background} onValueChange={setBackground} />
        <ToggleRow t={t} title="Nur über WLAN synchronisieren" value={wifiOnly} onValueChange={setWifiOnly} />
      </View>

      <Text style={s.section}>Sicherheit</Text>
      <View style={s.card}>
        <ToggleRow t={t} title="App-Sperre (Face ID)" value={appLock} onValueChange={setAppLock} />
        <Row t={t}>
          <View style={s.grow}>
            <Text style={s.itemTitle}>Zertifikat-Pinning</Text>
            <Text style={s.itemSub}>Nur vertraute Server (fail-closed)</Text>
          </View>
          <Text style={pinningActive ? s.pillOn : s.pillOff}>{pinningActive ? 'Aktiv' : 'Inaktiv'}</Text>
        </Row>
        <Row t={t}>
          <View style={s.grow}>
            <Text style={s.itemTitle}>Lokale Verschlüsselung</Text>
            <Text style={s.itemSub}>{APP_MODE === 'live' ? 'SQLCipher AES-256' : 'Demo (In-Memory)'}</Text>
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

function Row({ t, children }: { readonly t: AppTheme; readonly children: React.ReactNode }): React.JSX.Element {
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
    action: { backgroundColor: t.c.bgElevated, borderRadius: radius.sm, flex: 1, padding: space.sm },
    actionPrimary: { backgroundColor: t.c.brandPrimary },
    actionPrimaryText: { color: t.onBrand, fontWeight: '700', textAlign: 'center' },
    actionText: { color: t.c.textPrimary, fontWeight: '600', textAlign: 'center' },
    activeTag: { color: t.c.accent, fontSize: 11, fontWeight: '700' },
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
    pillOff: { color: t.c.textSecondary, fontSize: typography.caption.size, fontWeight: '700' },
    pillOn: { color: t.c.success, fontSize: typography.caption.size, fontWeight: '700' },
    rm: {
      borderColor: '#E6B9B9',
      borderRadius: radius.sm,
      borderWidth: 1,
      paddingHorizontal: space.sm,
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
    spacer: { height: space.lg },
  });
}
