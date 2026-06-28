import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { isValidEmail, toAccountId, type AccountId } from '@nexus/domain';
import {
  classifyError,
  domainFromEmail,
  normalizeEwsUrl,
  parseLogin,
  type AutodiscoverResult,
  type Credentials,
  type ErrorInfo,
} from '@nexus/core-transport';
import { radius, space, typography } from '@nexus/ui-kit';
import type { AppContainer } from '../composition/container';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface Props {
  readonly container: AppContainer;
  readonly onLoggedIn: (accountId: AccountId, email: string) => void;
  /** Optional: bricht den Fluss ab (z. B. „Konto hinzufügen" über einem aktiven Konto). */
  readonly onCancel?: () => void;
}

/**
 * Geführter 6-Schritt-Einrichtungs-Wizard (Live-Modus):
 *
 * 1. **E-Mail** – Adresse.
 * 2. **Anmeldung** – Passwort/Benutzer; „Verbindung prüfen" ermittelt den Server (Autodiscover)
 *    UND prüft die Zugangsdaten echt-authentifiziert (Test Connection).
 * 3. **Zertifikat** – nur bei TLS-Problem: Server-Fingerprint anzeigen und nach Bestätigung
 *    pinnen (Trust-on-First-Use; keine TLS-Abschwächung).
 * 4. **Server** – ermittelten Server prüfen/anpassen (manuell, falls Autodiscover scheitert).
 * 5. **Berechtigungen** – Mail (immer) / Kalender / Kontakte.
 * 6. **Fertig** – Zusammenfassung; Konto wird serverseitig bestätigt gespeichert (Secret nur
 *    im Keychain) und geöffnet.
 */
type Step = 'email' | 'credentials' | 'cert' | 'server' | 'permissions' | 'done';

const STEP_ORDER: readonly Step[] = ['email', 'credentials', 'server', 'permissions', 'done'];

interface CertInfo {
  readonly host: string;
  readonly spkiSha256: string;
  readonly subject: string;
}

export function LoginScreen({ container, onLoggedIn, onCancel }: Props): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [resolvedServer, setResolvedServer] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<AutodiscoverResult | null>(null);
  const [cert, setCert] = useState<CertInfo | null>(null);
  const [syncCalendar, setSyncCalendar] = useState(true);
  const [syncContacts, setSyncContacts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);

  const fail = (title: string, detail: string, technical: string): void => {
    setError({ kind: 'unknown', title, detail, technical });
  };

  const resetDiscovery = (): void => {
    setDiscovered(null);
    setResolvedServer(null);
  };

  /** Host für die Zertifikatsprüfung: manueller Server, sonst `mail.<domain>`. */
  const hostForCert = (): string | undefined => {
    const manual = serverUrl.trim();
    if (manual.length > 0) {
      // Host aus „https://host/pfad" bzw. „user@host" extrahieren (kein URL() in Hermes).
      const noScheme = manual.replace(/^[a-z]+:\/\//i, '');
      const hostPart = noScheme.split('/')[0] ?? noScheme;
      const host = hostPart.split('@').pop() ?? hostPart;
      return host.length > 0 ? host : undefined;
    }
    const domain = domainFromEmail(email.trim());
    return domain !== undefined ? `mail.${domain}` : undefined;
  };

  const buildCredentials = (withManualServer: boolean): Credentials | null => {
    if (password.length === 0) {
      fail('Passwort fehlt', 'Bitte dein Passwort eingeben.', 'leeres Passwort');
      return null;
    }
    const loginName = username.trim().length > 0 ? username.trim() : email.trim();
    const login = parseLogin(loginName);
    const scheme = login.form === 'downlevel' ? 'ntlm' : 'basic';
    let manualEws: string | undefined;
    if (withManualServer) {
      manualEws = normalizeEwsUrl(serverUrl);
      if (manualEws === undefined) {
        fail(
          'Server-Adresse ungültig',
          'Bitte eine gültige EWS-/Server-URL eingeben (z. B. mail.firma.de).',
          serverUrl,
        );
        return null;
      }
    }
    return {
      username: loginName,
      secret: password,
      scheme,
      ...(login.form === 'downlevel' && login.domain !== undefined ? { domain: login.domain } : {}),
      ...(manualEws !== undefined ? { manual: { ewsUrl: manualEws } } : {}),
    };
  };

  const continueFromEmail = (): void => {
    if (busy) return;
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      fail('E-Mail prüfen', 'Bitte eine gültige E-Mail-Adresse eingeben.', `ungültig: ${trimmed}`);
      return;
    }
    setError(null);
    setStep('credentials');
  };

  /** Test Connection: Autodiscover + echte Anmeldeprüfung. Steuert die Folgeschritte. */
  const testConnection = async (withManualServer: boolean): Promise<void> => {
    if (busy) return;
    const credentials = buildCredentials(withManualServer);
    if (credentials === null) return;
    setBusy(true);
    setError(null);
    setShowTechnical(false);
    try {
      const result = await container.setup.discover(email.trim(), credentials);
      await container.transport.verifyCredentials(email.trim());
      setDiscovered(result);
      setResolvedServer(result.ewsUrl ?? credentials.manual?.ewsUrl ?? null);
      setStep('server');
    } catch (e: unknown) {
      const info = classifyError(e);
      setError(info);
      // TLS-Problem (z. B. firmeninternes Zertifikat) → Zertifikat bestätigen (TOFU).
      if (info.kind === 'tls' && container.probeCertificate !== undefined) {
        setStep('cert');
        return;
      }
      // Autodiscover scheitert → manuelle Servereingabe, sinnvollen Host vorbefüllen.
      if (info.kind === 'autodiscover') {
        if (serverUrl.trim().length === 0) {
          const domain = domainFromEmail(email.trim());
          if (domain !== undefined) setServerUrl(`mail.${domain}`);
        }
        setStep('server');
      }
    } finally {
      setBusy(false);
    }
  };

  /** Liest das Server-Zertifikat (Fingerprint), ohne zu vertrauen. */
  const readCertificate = async (): Promise<void> => {
    if (busy || container.probeCertificate === undefined) return;
    const host = hostForCert();
    if (host === undefined) {
      fail('Server unbekannt', 'Bitte erst die Serveradresse angeben.', 'kein Host');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setCert(await container.probeCertificate(host));
    } catch (e: unknown) {
      setError(classifyError(e));
    } finally {
      setBusy(false);
    }
  };

  /** Zertifikat pinnen (TOFU) und Verbindung erneut prüfen. */
  const trustAndContinue = async (): Promise<void> => {
    if (busy || cert === null || container.trustCertificate === undefined) return;
    setBusy(true);
    setError(null);
    try {
      await container.trustCertificate(cert.host, cert.spkiSha256);
    } catch (e: unknown) {
      setError(classifyError(e));
      setBusy(false);
      return;
    }
    setBusy(false);
    setCert(null);
    await testConnection(serverUrl.trim().length > 0);
  };

  /** Schritt „Fertig": Konto serverseitig bestätigt speichern + öffnen. */
  const finish = async (): Promise<void> => {
    if (busy || discovered === null) return;
    const credentials = buildCredentials(serverUrl.trim().length > 0);
    if (credentials === null) return;
    const trimmedEmail = email.trim();
    setBusy(true);
    setError(null);
    try {
      await container.setup.completeSetup(trimmedEmail, credentials, discovered);
      // Berechtigungen merken (Mail immer aktiv; Kalender/Kontakte optional).
      await container.secureStore
        .set(
          `nexus:perms:${trimmedEmail.toLowerCase()}`,
          JSON.stringify({ mail: true, calendar: syncCalendar, contacts: syncContacts }),
        )
        .catch(() => undefined);
      onLoggedIn(toAccountId(trimmedEmail.toLowerCase()), trimmedEmail);
    } catch (e: unknown) {
      setError(classifyError(e));
    } finally {
      setBusy(false);
    }
  };

  const errorBox =
    error !== null ? (
      <View style={s.errorBox}>
        <Text style={s.errorTitle}>{error.title}</Text>
        <Text style={s.errorDetail}>{error.detail}</Text>
        {error.hint !== undefined ? <Text style={s.errorHint}>{error.hint}</Text> : null}
        <Pressable onPress={() => setShowTechnical((v) => !v)}>
          <Text style={s.errorToggle}>
            {showTechnical ? 'Details ausblenden' : 'Technische Details'}
          </Text>
        </Pressable>
        {showTechnical ? <Text style={s.errorTechnical}>{error.technical}</Text> : null}
      </View>
    ) : null;

  return (
    <View style={s.container}>
      {onCancel !== undefined ? (
        <Pressable style={s.cancelRow} onPress={onCancel} hitSlop={8}>
          <Text style={s.cancelLink}>‹ Abbrechen</Text>
        </Pressable>
      ) : null}
      <Text style={s.title}>{onCancel !== undefined ? 'Konto hinzufügen' : 'NEXUS'}</Text>
      <StepDots step={step} s={s} t={t} />

      {step === 'email' ? (
        <>
          <Text style={s.subtitle}>Mit deinem Exchange-Konto anmelden</Text>
          <TextInput
            style={s.input}
            placeholder="E-Mail-Adresse"
            placeholderTextColor={t.c.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={continueFromEmail}
            returnKeyType="next"
          />
          {errorBox}
          <Pressable style={s.button} onPress={continueFromEmail}>
            <Text style={s.buttonText}>Weiter</Text>
          </Pressable>
          <Text style={s.hint}>Wir ermitteln deinen Server automatisch (Autodiscover).</Text>
        </>
      ) : null}

      {step === 'credentials' ? (
        <>
          <AccountRow email={email} onChange={() => setStep('email')} label="Ändern" s={s} />
          <Text style={s.subtitle}>Zugangsdaten & Verbindung prüfen</Text>
          <TextInput
            style={s.input}
            placeholder="Passwort"
            placeholderTextColor={t.c.textSecondary}
            secureTextEntry
            autoFocus
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              resetDiscovery();
            }}
          />
          <TextInput
            style={s.input}
            placeholder="Benutzername (optional, z. B. DOMÄNE\Benutzer)"
            placeholderTextColor={t.c.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={(v) => {
              setUsername(v);
              resetDiscovery();
            }}
          />
          {errorBox}
          <PrimaryButton
            label="Verbindung prüfen"
            busy={busy}
            onPress={() => void testConnection(false)}
            s={s}
            t={t}
          />
          <Pressable onPress={() => setStep('server')} hitSlop={6}>
            <Text style={s.secondaryLink}>Server manuell eingeben</Text>
          </Pressable>
        </>
      ) : null}

      {step === 'cert' ? (
        <>
          <AccountRow email={email} onChange={() => setStep('credentials')} label="Zurück" s={s} />
          <Text style={s.subtitle}>Server-Zertifikat bestätigen</Text>
          {cert === null ? (
            <>
              <Text style={s.advancedHint}>
                Dein Server nutzt vermutlich ein firmeninternes Zertifikat. Lies den Fingerprint aus
                und vergleiche ihn mit deiner IT, bevor du ihm vertraust.
              </Text>
              {errorBox}
              <PrimaryButton
                label="Zertifikat lesen"
                busy={busy}
                onPress={() => void readCertificate()}
                s={s}
                t={t}
              />
            </>
          ) : (
            <>
              <View style={s.certBox}>
                <Text style={s.certLabel}>Host</Text>
                <Text style={s.certValue}>{cert.host}</Text>
                <Text style={s.certLabel}>Aussteller / Subjekt</Text>
                <Text style={s.certValue}>{cert.subject || '—'}</Text>
                <Text style={s.certLabel}>SHA-256-Fingerprint (SPKI)</Text>
                <Text style={s.certFingerprint}>{cert.spkiSha256}</Text>
              </View>
              {errorBox}
              <PrimaryButton
                label="Vertrauen & fortfahren"
                busy={busy}
                onPress={() => void trustAndContinue()}
                s={s}
                t={t}
              />
              <Pressable onPress={() => setCert(null)} hitSlop={6}>
                <Text style={s.secondaryLink}>Anderes Zertifikat lesen</Text>
              </Pressable>
            </>
          )}
        </>
      ) : null}

      {step === 'server' ? (
        <>
          <AccountRow email={email} onChange={() => setStep('credentials')} label="Zurück" s={s} />
          <Text style={s.subtitle}>Server prüfen</Text>
          {resolvedServer !== null ? (
            <View style={s.serverInfoBox}>
              <Text style={s.serverInfoLabel}>Ermittelter Server</Text>
              <Text style={s.serverInfoUrl} numberOfLines={2}>
                {resolvedServer}
              </Text>
            </View>
          ) : (
            <Text style={s.advancedHint}>
              Autodiscover hat keinen Server gefunden. Bitte die Adresse manuell angeben.
            </Text>
          )}
          <TextInput
            style={s.input}
            placeholder="EWS-/Server-Adresse (z. B. mail.firma.de)"
            placeholderTextColor={t.c.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            value={serverUrl}
            onChangeText={(v) => {
              setServerUrl(v);
              resetDiscovery();
            }}
          />
          {errorBox}
          {discovered !== null ? (
            <PrimaryButton
              label="Weiter"
              busy={busy}
              onPress={() => setStep('permissions')}
              s={s}
              t={t}
            />
          ) : (
            <PrimaryButton
              label="Verbindung prüfen"
              busy={busy}
              onPress={() => void testConnection(true)}
              s={s}
              t={t}
            />
          )}
        </>
      ) : null}

      {step === 'permissions' ? (
        <>
          <AccountRow email={email} onChange={() => setStep('server')} label="Zurück" s={s} />
          <Text style={s.subtitle}>Was soll synchronisiert werden?</Text>
          <ToggleRow label="E-Mail" value enabled={false} onChange={() => undefined} s={s} t={t} />
          <ToggleRow
            label="Kalender"
            value={syncCalendar}
            enabled
            onChange={setSyncCalendar}
            s={s}
            t={t}
          />
          <ToggleRow
            label="Kontakte"
            value={syncContacts}
            enabled
            onChange={setSyncContacts}
            s={s}
            t={t}
          />
          {errorBox}
          <PrimaryButton label="Weiter" busy={busy} onPress={() => setStep('done')} s={s} t={t} />
        </>
      ) : null}

      {step === 'done' ? (
        <>
          <AccountRow email={email} onChange={() => setStep('permissions')} label="Zurück" s={s} />
          <Text style={s.subtitle}>Bereit zur Einrichtung</Text>
          <View style={s.summaryBox}>
            <SummaryRow k="Konto" v={email.trim()} s={s} />
            <SummaryRow k="Server" v={resolvedServer ?? serverUrl.trim()} s={s} />
            <SummaryRow
              k="Synchronisieren"
              v={['E-Mail', syncCalendar ? 'Kalender' : null, syncContacts ? 'Kontakte' : null]
                .filter((x): x is string => x !== null)
                .join(' · ')}
              s={s}
            />
          </View>
          {errorBox}
          <PrimaryButton
            label="Konto einrichten"
            busy={busy}
            onPress={() => void finish()}
            s={s}
            t={t}
          />
        </>
      ) : null}
    </View>
  );
}

function StepDots({ step, s, t }: { step: Step; s: Styles; t: AppTheme }): React.JSX.Element {
  // 'cert' zählt als Teil von 'credentials' für die Fortschrittsanzeige.
  const current = step === 'cert' ? 'credentials' : step;
  const idx = STEP_ORDER.indexOf(current);
  return (
    <View style={s.dotsRow}>
      {STEP_ORDER.map((st, i) => (
        <View
          key={st}
          style={[s.dot, { backgroundColor: i <= idx ? t.c.brandPrimary : t.border }]}
        />
      ))}
    </View>
  );
}

function AccountRow({
  email,
  onChange,
  label,
  s,
}: {
  email: string;
  onChange: () => void;
  label: string;
  s: Styles;
}): React.JSX.Element {
  return (
    <View style={s.accountRow}>
      <Text style={s.accountEmail} numberOfLines={1}>
        {email.trim()}
      </Text>
      <Pressable onPress={onChange} hitSlop={6}>
        <Text style={s.changeLink}>{label}</Text>
      </Pressable>
    </View>
  );
}

function PrimaryButton({
  label,
  busy,
  onPress,
  s,
  t,
}: {
  label: string;
  busy: boolean;
  onPress: () => void;
  s: Styles;
  t: AppTheme;
}): React.JSX.Element {
  return (
    <Pressable style={[s.button, busy ? s.buttonDisabled : null]} disabled={busy} onPress={onPress}>
      {busy ? <ActivityIndicator color={t.onBrand} /> : <Text style={s.buttonText}>{label}</Text>}
    </Pressable>
  );
}

function ToggleRow({
  label,
  value,
  enabled,
  onChange,
  s,
  t,
}: {
  label: string;
  value: boolean;
  enabled: boolean;
  onChange: (v: boolean) => void;
  s: Styles;
  t: AppTheme;
}): React.JSX.Element {
  return (
    <View style={s.toggleRow}>
      <Text style={s.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        disabled={!enabled}
        onValueChange={onChange}
        trackColor={{ true: t.c.brandPrimary, false: t.border }}
      />
    </View>
  );
}

function SummaryRow({ k, v, s }: { k: string; v: string; s: Styles }): React.JSX.Element {
  return (
    <View style={s.summaryRow}>
      <Text style={s.summaryKey}>{k}</Text>
      <Text style={s.summaryVal} numberOfLines={2}>
        {v}
      </Text>
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    accountEmail: {
      color: t.c.textPrimary,
      flex: 1,
      fontSize: typography.body.size,
      fontWeight: '600',
    },
    accountRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: space.sm,
    },
    advancedHint: {
      color: t.c.textSecondary,
      fontSize: typography.caption.size,
      marginBottom: space.sm,
    },
    button: {
      alignItems: 'center',
      backgroundColor: t.c.brandPrimary,
      borderRadius: radius.pill,
      marginTop: space.sm,
      paddingVertical: space.md,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: t.onBrand, fontSize: typography.body.size, fontWeight: '600' },
    cancelLink: { color: t.c.brandPrimary, fontSize: typography.body.size, fontWeight: '600' },
    cancelRow: { marginBottom: space.md },
    certBox: {
      backgroundColor: t.c.bgElevated,
      borderRadius: radius.md,
      marginBottom: space.sm,
      padding: space.md,
    },
    certFingerprint: {
      color: t.c.textPrimary,
      fontFamily: 'Menlo',
      fontSize: typography.caption.size,
      marginTop: space.xxs,
    },
    certLabel: {
      color: t.c.textSecondary,
      fontSize: typography.caption.size,
      marginTop: space.xs,
    },
    certValue: { color: t.c.textPrimary, fontSize: typography.body.size, marginTop: space.xxs },
    changeLink: { color: t.c.brandPrimary, fontSize: typography.caption.size, fontWeight: '600' },
    container: {
      backgroundColor: t.c.bgCanvas,
      flex: 1,
      justifyContent: 'center',
      padding: space.lg,
    },
    dot: { borderRadius: 3, flex: 1, height: 4, marginHorizontal: 3 },
    dotsRow: { flexDirection: 'row', marginBottom: space.lg, marginTop: space.xs },
    errorBox: {
      backgroundColor: t.c.danger + '14',
      borderColor: t.c.danger,
      borderLeftWidth: 3,
      borderRadius: radius.sm,
      marginBottom: space.sm,
      marginTop: space.sm,
      padding: space.md,
    },
    errorDetail: { color: t.c.textPrimary, fontSize: typography.body.size, marginTop: space.xxs },
    errorHint: { color: t.c.textSecondary, fontSize: typography.caption.size, marginTop: space.xs },
    errorTechnical: {
      color: t.c.textSecondary,
      fontSize: typography.caption.size,
      marginTop: space.xs,
    },
    errorTitle: { color: t.c.danger, fontSize: typography.body.size, fontWeight: '700' },
    errorToggle: {
      color: t.c.brandPrimary,
      fontSize: typography.caption.size,
      marginTop: space.xs,
    },
    hint: {
      color: t.c.textSecondary,
      fontSize: typography.caption.size,
      marginTop: space.md,
      textAlign: 'center',
    },
    input: {
      backgroundColor: t.c.bgElevated,
      borderRadius: radius.md,
      color: t.c.textPrimary,
      fontSize: typography.body.size,
      marginBottom: space.sm,
      padding: space.md,
    },
    secondaryLink: {
      color: t.c.brandPrimary,
      fontSize: typography.caption.size,
      marginTop: space.md,
      textAlign: 'center',
    },
    serverInfoBox: {
      backgroundColor: t.c.success + '14',
      borderRadius: radius.sm,
      marginBottom: space.sm,
      padding: space.md,
    },
    serverInfoLabel: { color: t.c.textSecondary, fontSize: typography.caption.size },
    serverInfoUrl: { color: t.c.textPrimary, fontSize: typography.body.size, marginTop: space.xxs },
    subtitle: { color: t.c.textSecondary, fontSize: typography.body.size, marginBottom: space.lg },
    summaryBox: {
      backgroundColor: t.c.bgElevated,
      borderRadius: radius.md,
      marginBottom: space.sm,
      padding: space.md,
    },
    summaryKey: { color: t.c.textSecondary, fontSize: typography.caption.size, width: 120 },
    summaryRow: { flexDirection: 'row', marginBottom: space.xs },
    summaryVal: { color: t.c.textPrimary, flex: 1, fontSize: typography.body.size },
    title: { color: t.c.brandPrimary, fontSize: 34, fontWeight: '700', marginBottom: space.sm },
    toggleLabel: { color: t.c.textPrimary, fontSize: typography.body.size },
    toggleRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: space.sm,
    },
  });
}
