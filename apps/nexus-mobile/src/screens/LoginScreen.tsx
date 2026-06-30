import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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
  parseLogin,
  type AutodiscoverResult,
  type Credentials,
  type ErrorInfo,
  type LoginForm,
} from '@nexus/core-transport';
import { radius, space, typography } from '@nexus/ui-kit';
import type { AppContainer } from '../composition/container';
import { BrandMark } from '../components/BrandMark';
import { Icon } from '../components/Icon';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface Props {
  readonly container: AppContainer;
  readonly onLoggedIn: (accountId: AccountId, email: string) => void;
  /** Optional: bricht den Fluss ab (z. B. „Konto hinzufügen" über einem aktiven Konto). */
  readonly onCancel?: () => void;
}

/**
 * Geführter Einrichtungs-Wizard (Live-Modus) — ActiveSync (EAS) zuerst:
 *
 * 1. **E-Mail** – Adresse eingeben.
 * 2. **Server** – Serverkonfiguration in Kategorien: *Server* (Host, Autodiscover), *Anmeldung*
 *    (Benutzernamen-Format + editierbarer Benutzer/Domäne, aus der E-Mail vorbelegt) und
 *    einklappbare *Experten-Einstellungen* (EAS-Pfad, Port, SSL/TLS, Firmenzertifikat,
 *    EWS-Fallback). Alles aus der Domäne vorermittelt und anpassbar.
 * 3. **Anmeldung** – Passwort eingeben (Anmeldename read-only zur Kontrolle). Der Nutzer
 *    bestätigt ausdrücklich, dass die Organisation das Gerät über EAS aus der Ferne zurücksetzen
 *    kann; danach läuft die echte Anmeldung (Autodiscover/Server + Authentifizierung).
 * 4. **Zertifikat** – nur bei TLS-Problem: Server-Fingerprint anzeigen und nach Bestätigung
 *    pinnen (Trust-on-First-Use; keine TLS-Abschwächung).
 * 5. **Berechtigungen** – Kalender / Kontakte; danach wird das Konto serverseitig bestätigt
 *    gespeichert (Secret nur im Keychain) und geöffnet.
 */
type Step = 'email' | 'config' | 'credentials' | 'cert' | 'permissions';

const STEP_ORDER: readonly Step[] = ['email', 'config', 'credentials', 'permissions'];

const DEFAULT_EAS_PATH = '/Microsoft-Server-ActiveSync';
const DEFAULT_PORT = '443';

interface CertInfo {
  readonly host: string;
  readonly spkiSha256: string;
  readonly subject: string;
}

/** Lokaler Teil (vor dem @) einer E-Mail-Adresse. */
function localPart(email: string): string {
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

/** Vermutete NetBIOS-Domäne (erstes Label der DNS-Domäne, groß) — für `DOMÄNE\Benutzer`. */
function netbiosGuess(domain: string | undefined): string {
  if (domain === undefined) return '';
  const label = domain.split('.')[0] ?? domain;
  return label.toUpperCase();
}

/** Vorbelegung für das Benutzerfeld je Format: bei UPN die volle Adresse, sonst nur der Name. */
function defaultUserField(format: LoginForm, email: string): string {
  const e = email.trim();
  if (e.length === 0) return '';
  const user = localPart(e);
  if (format === 'upn') {
    const domain = domainFromEmail(e);
    return domain !== undefined ? `${user}@${domain}` : user;
  }
  return user;
}

/** Vorbelegung für das Domänenfeld (NetBIOS) aus der E-Mail — nur für DOMÄNE\Benutzer. */
function defaultDomainField(email: string): string {
  return netbiosGuess(domainFromEmail(email.trim()));
}

export function LoginScreen({ container, onLoggedIn, onCancel }: Props): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Anmeldename: für DOMÄNE\Benutzer getrennt (das „\" wird automatisch ergänzt), sonst nur
  // das Benutzerfeld. Beides aus der E-Mail vorbelegt und frei editierbar.
  const [userField, setUserField] = useState('');
  const [domainField, setDomainField] = useState('');
  const [loginFormat, setLoginFormat] = useState<LoginForm>('upn');

  // Serverkonfiguration (aus der Domäne vorermittelt, anpassbar).
  const [autodiscover, setAutodiscover] = useState(true);
  const [serverHost, setServerHost] = useState('');
  const [easPath, setEasPath] = useState(DEFAULT_EAS_PATH);
  const [port, setPort] = useState(DEFAULT_PORT);
  const [allowSelfSigned, setAllowSelfSigned] = useState(true);
  // Experten-Einstellungen (EAS-Pfad, Port, TLS, Zertifikat, EWS-Fallback) einklappbar.
  const [showExpert, setShowExpert] = useState(false);
  // EAS-Hardfailure → EWS nur, wenn ausdrücklich erlaubt. Standard AUS ⇒ ausschließlich EAS.
  const [easFallbackToEws, setEasFallbackToEws] = useState(false);
  // Pflicht-Einwilligung: Organisation darf das Gerät über EAS aus der Ferne zurücksetzen.
  const [wipeConsent, setWipeConsent] = useState(false);

  const [syncCalendar, setSyncCalendar] = useState(true);
  const [syncContacts, setSyncContacts] = useState(true);
  const [resolvedServer, setResolvedServer] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<AutodiscoverResult | null>(null);
  const [cert, setCert] = useState<CertInfo | null>(null);
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

  /** Server-Host: manuell gesetzt, sonst `mail.<domain>` aus der E-Mail. */
  const effectiveHost = (): string | undefined => {
    const manual = serverHost.trim();
    if (manual.length > 0) return manual;
    const domain = domainFromEmail(email.trim());
    return domain !== undefined ? `mail.${domain}` : undefined;
  };

  /** Port-Suffix für URLs (leer bei Standard-Port 443). */
  const portSuffix = (): string => {
    const p = port.trim();
    return p === '' || p === DEFAULT_PORT ? '' : `:${p}`;
  };

  /** Manuelle Server-URLs (EWS + EAS) aus den Feldern bauen; `null` bei ungültiger Eingabe. */
  const buildManual = (): { ewsUrl: string; easUrl: string } | null => {
    const host = effectiveHost();
    if (host === undefined || !host.includes('.')) {
      fail(
        'Server-Adresse ungültig',
        'Bitte einen gültigen Server-Host angeben (z. B. mail.firma.de).',
        serverHost,
      );
      return null;
    }
    const p = port.trim();
    if (p !== '' && !/^\d+$/.test(p)) {
      fail('Port ungültig', 'Der Port muss eine Zahl sein (Standard 443).', port);
      return null;
    }
    const suffix = portSuffix();
    let path = easPath.trim();
    if (path.length === 0) path = DEFAULT_EAS_PATH;
    if (!path.startsWith('/')) path = `/${path}`;
    return {
      ewsUrl: `https://${host}${suffix}/EWS/Exchange.asmx`,
      easUrl: `https://${host}${suffix}${path}`,
    };
  };

  /**
   * Effektiver Anmeldename aus den editierbaren Feldern. Bei DOMÄNE\Benutzer werden Domäne und
   * Benutzer mit „\" verbunden (automatisch); sonst zählt nur das Benutzerfeld (UPN bzw. bar).
   */
  const effectiveLogin = (): string => {
    const u = userField.trim();
    if (loginFormat === 'downlevel') {
      const d = domainField.trim();
      return d.length > 0 && u.length > 0 ? `${d}\\${u}` : u;
    }
    return u;
  };

  const buildCredentials = (): Credentials | null => {
    if (password.length === 0) {
      fail('Passwort fehlt', 'Bitte dein Passwort eingeben.', 'leeres Passwort');
      return null;
    }
    const loginName = effectiveLogin();
    if (loginName.length === 0) {
      fail('Benutzername fehlt', 'Bitte einen Benutzernamen eingeben.', 'leerer Benutzername');
      return null;
    }
    const login = parseLogin(loginName);
    const scheme = login.form === 'downlevel' ? 'ntlm' : 'basic';
    // Manueller Server, sobald Autodiscover deaktiviert ist (oder der Nutzer Felder anpasst).
    let manual: { ewsUrl: string; easUrl: string } | undefined;
    if (!autodiscover) {
      const built = buildManual();
      if (built === null) return null;
      manual = built;
    }
    return {
      username: loginName,
      secret: password,
      scheme,
      ...(login.form === 'downlevel' && login.domain !== undefined ? { domain: login.domain } : {}),
      ...(manual !== undefined ? { manual } : {}),
      ...(easFallbackToEws ? { easFallbackToEws: true } : {}),
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
    // Server-Host, Benutzer- und Domänenfeld aus der E-Mail vorbelegen (alles anpassbar).
    const domain = domainFromEmail(trimmed);
    if (serverHost.trim().length === 0 && domain !== undefined) setServerHost(`mail.${domain}`);
    if (userField.trim().length === 0) setUserField(defaultUserField(loginFormat, trimmed));
    if (domainField.trim().length === 0) setDomainField(defaultDomainField(trimmed));
    setStep('config');
  };

  const continueFromConfig = (): void => {
    if (busy) return;
    if (effectiveLogin().length === 0) {
      fail('Benutzername fehlt', 'Bitte einen Benutzernamen eingeben.', 'leeres Benutzerfeld');
      return;
    }
    setError(null);
    setStep('credentials');
  };

  const changeFormat = (format: LoginForm): void => {
    // Benutzerfeld passend zum Format neu vorbelegen, wenn es leer ist oder noch der
    // Vorbelegung des alten Formats entspricht (eigene Eingaben bleiben erhalten).
    const wasDefault =
      userField.trim().length === 0 || userField.trim() === defaultUserField(loginFormat, email);
    setLoginFormat(format);
    if (wasDefault) setUserField(defaultUserField(format, email));
    if (domainField.trim().length === 0) setDomainField(defaultDomainField(email));
    resetDiscovery();
  };

  /** Echte Anmeldung: Autodiscover/Server ermitteln + authentifizieren. Steuert die Folgeschritte. */
  const runLogin = async (): Promise<void> => {
    if (busy) return;
    if (!wipeConsent) {
      fail(
        'Bestätigung erforderlich',
        'Bitte bestätige, dass deine Organisation das Gerät über ActiveSync zurücksetzen darf.',
        'wipeConsent=false',
      );
      return;
    }
    const credentials = buildCredentials();
    if (credentials === null) return;
    setBusy(true);
    setError(null);
    setShowTechnical(false);
    try {
      const result = await container.setup.discover(email.trim(), credentials);
      await container.transport.verifyCredentials(email.trim());
      setDiscovered(result);
      setResolvedServer(result.ewsUrl ?? credentials.manual?.ewsUrl ?? null);
      setStep('permissions');
    } catch (e: unknown) {
      const info = classifyError(e);
      setError(info);
      // TLS-Problem (firmeninternes Zertifikat) → nur anbieten, wenn der Nutzer es zulässt.
      if (info.kind === 'tls' && allowSelfSigned && container.probeCertificate !== undefined) {
        setStep('cert');
      }
    } finally {
      setBusy(false);
    }
  };

  /** Liest das Server-Zertifikat (Fingerprint), ohne zu vertrauen. */
  const readCertificate = async (): Promise<void> => {
    if (busy || container.probeCertificate === undefined) return;
    const host = effectiveHost();
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

  /** Zertifikat pinnen (TOFU) und Anmeldung erneut versuchen. */
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
    setStep('credentials');
    await runLogin();
  };

  /** Schritt „Berechtigungen": Konto serverseitig bestätigt speichern + öffnen. */
  const finish = async (): Promise<void> => {
    if (busy || discovered === null) return;
    const credentials = buildCredentials();
    if (credentials === null) return;
    const trimmedEmail = email.trim();
    setBusy(true);
    setError(null);
    try {
      await container.setup.completeSetup(trimmedEmail, credentials, discovered);
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
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={s.flex}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {onCancel !== undefined ? (
          <Pressable style={s.cancelRow} onPress={onCancel} hitSlop={8}>
            <Icon name="chevronLeft" size={20} color={t.c.brandPrimary} />
            <Text style={s.cancelLink}>Abbrechen</Text>
          </Pressable>
        ) : null}
        {onCancel === undefined ? (
          <View style={s.brandRow}>
            <BrandMark size={56} />
          </View>
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
            <Text style={s.hint}>
              Wir ermitteln Server und ActiveSync-Pfad automatisch — du kannst sie im nächsten
              Schritt prüfen.
            </Text>
          </>
        ) : null}

        {step === 'config' ? (
          <>
            <AccountRow email={email} onChange={() => setStep('email')} label="Ändern" s={s} />
            <Text style={s.subtitle}>Serverkonfiguration</Text>

            <SectionTitle text="Server" s={s} />
            <ToggleRow
              label="Automatisch ermitteln (Autodiscover)"
              value={autodiscover}
              enabled
              onChange={(v) => {
                setAutodiscover(v);
                resetDiscovery();
              }}
              s={s}
              t={t}
            />
            <FieldLabel text="Server (Host)" s={s} />
            <TextInput
              style={s.input}
              placeholder="mail.firma.de"
              placeholderTextColor={t.c.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              value={serverHost}
              onChangeText={(v) => {
                setServerHost(v);
                setAutodiscover(false);
                resetDiscovery();
              }}
            />

            <SectionTitle text="Anmeldung" s={s} />
            <FieldLabel text="Anmelde-/Benutzernamen-Format" s={s} />
            <Segmented
              options={[
                { key: 'downlevel', label: 'DOMÄNE\\Benutzer' },
                { key: 'upn', label: 'name@firma' },
                { key: 'bare', label: 'Benutzer' },
              ]}
              value={loginFormat}
              onChange={(k) => changeFormat(k as LoginForm)}
              s={s}
              t={t}
            />
            {loginFormat === 'downlevel' ? (
              <View style={s.twoCol}>
                <View style={s.col}>
                  <FieldLabel text="Domäne" s={s} />
                  <TextInput
                    style={s.input}
                    placeholder="DOMÄNE"
                    placeholderTextColor={t.c.textSecondary}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    value={domainField}
                    onChangeText={(v) => {
                      setDomainField(v);
                      resetDiscovery();
                    }}
                  />
                </View>
                <View style={s.col}>
                  <FieldLabel text="Benutzername" s={s} />
                  <TextInput
                    style={s.input}
                    placeholder="benutzer"
                    placeholderTextColor={t.c.textSecondary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={userField}
                    onChangeText={(v) => {
                      setUserField(v);
                      resetDiscovery();
                    }}
                  />
                </View>
              </View>
            ) : (
              <>
                <FieldLabel text="Benutzername" s={s} />
                <TextInput
                  style={s.input}
                  placeholder={loginFormat === 'upn' ? 'name@firma.de' : 'benutzer'}
                  placeholderTextColor={t.c.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType={loginFormat === 'upn' ? 'email-address' : 'default'}
                  value={userField}
                  onChangeText={(v) => {
                    setUserField(v);
                    resetDiscovery();
                  }}
                />
              </>
            )}
            <Text style={s.fieldHint}>
              Trägt der Benutzername von der E-Mail ab, kannst du ihn hier anpassen.
            </Text>
            <View style={s.previewBox}>
              <Text style={s.previewLabel}>Anmeldung als</Text>
              <Text style={s.previewValue}>{effectiveLogin() || '—'}</Text>
            </View>

            <Pressable style={s.expertToggle} onPress={() => setShowExpert((v) => !v)} hitSlop={6}>
              <Text style={s.expertToggleText}>Experten-Einstellungen</Text>
              <Icon
                name={showExpert ? 'chevronDown' : 'chevronRight'}
                size={18}
                color={t.c.brandPrimary}
              />
            </Pressable>
            {showExpert ? (
              <View style={s.expertBox}>
                <SectionTitle text="ActiveSync / EWS" s={s} />
                <FieldLabel text="ActiveSync-Pfad (EAS)" s={s} />
                <TextInput
                  style={s.input}
                  placeholder={DEFAULT_EAS_PATH}
                  placeholderTextColor={t.c.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={easPath}
                  onChangeText={(v) => {
                    setEasPath(v);
                    setAutodiscover(false);
                    resetDiscovery();
                  }}
                />
                <FieldLabel text="Port" s={s} />
                <TextInput
                  style={s.input}
                  placeholder={DEFAULT_PORT}
                  placeholderTextColor={t.c.textSecondary}
                  keyboardType="number-pad"
                  value={port}
                  onChangeText={(v) => {
                    setPort(v);
                    setAutodiscover(false);
                    resetDiscovery();
                  }}
                />
                <ToggleRow
                  label="Fallback auf EWS erlauben"
                  value={easFallbackToEws}
                  enabled
                  onChange={setEasFallbackToEws}
                  s={s}
                  t={t}
                />
                <Text style={s.fieldHint}>
                  Standard: aus — es wird ausschließlich ActiveSync (EAS) verwendet. Nur aktivieren,
                  wenn dein Server EAS nicht unterstützt.
                </Text>

                <SectionTitle text="Sicherheit / TLS" s={s} />
                <ToggleRow
                  label="SSL/TLS verwenden"
                  value
                  enabled={false}
                  onChange={() => undefined}
                  s={s}
                  t={t}
                />
                <ReadonlyRow k="Minimum TLS-Version" v="TLS 1.2" s={s} />
                <ReadonlyRow k="EAS-Protokollversion" v="Automatisch (ausgehandelt)" s={s} />
                <ToggleRow
                  label="Selbstsigniertes/Firmenzertifikat zulassen"
                  value={allowSelfSigned}
                  enabled
                  onChange={setAllowSelfSigned}
                  s={s}
                  t={t}
                />
              </View>
            ) : null}

            {errorBox}
            <PrimaryButton label="Weiter" busy={busy} onPress={continueFromConfig} s={s} t={t} />
          </>
        ) : null}

        {step === 'credentials' ? (
          <>
            <AccountRow email={email} onChange={() => setStep('config')} label="Zurück" s={s} />
            <Text style={s.subtitle}>Anmeldung</Text>
            <View style={s.previewBox}>
              <Text style={s.previewLabel}>Anmeldung als</Text>
              <Text style={s.previewValue}>{effectiveLogin() || '—'}</Text>
            </View>
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

            <View style={s.consentBox}>
              <View style={s.consentHeader}>
                <Icon name="shield" size={18} color={t.c.warning} />
                <Text style={s.consentTitle}>ActiveSync (EAS) — Hinweis</Text>
              </View>
              <Text style={s.consentText}>
                Bei der Anmeldung über ActiveSync kann deine Organisation dieses Gerät verwalten und
                aus der Ferne zurücksetzen bzw. löschen (Remote-Wipe).
              </Text>
              <Pressable style={s.checkRow} onPress={() => setWipeConsent((v) => !v)} hitSlop={6}>
                <View style={[s.checkBox, wipeConsent ? s.checkBoxOn : null]}>
                  {wipeConsent ? <Icon name="check" size={14} color={t.onBrand} /> : null}
                </View>
                <Text style={s.checkLabel}>Das ist mir bewusst und ich stimme zu.</Text>
              </Pressable>
            </View>

            {errorBox}
            <PrimaryButton
              label="Anmelden"
              busy={busy}
              onPress={() => void runLogin()}
              s={s}
              t={t}
            />
          </>
        ) : null}

        {step === 'cert' ? (
          <>
            <AccountRow
              email={email}
              onChange={() => setStep('credentials')}
              label="Zurück"
              s={s}
            />
            <Text style={s.subtitle}>Server-Zertifikat bestätigen</Text>
            {cert === null ? (
              <>
                <Text style={s.advancedHint}>
                  Dein Server nutzt vermutlich ein firmeninternes Zertifikat. Lies den Fingerprint
                  aus und vergleiche ihn mit deiner IT, bevor du ihm vertraust.
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

        {step === 'permissions' ? (
          <>
            <Text style={s.subtitle}>Was soll synchronisiert werden?</Text>
            <View style={s.serverInfoBox}>
              <Text style={s.serverInfoLabel}>Angemeldet · Server</Text>
              <Text style={s.serverInfoUrl} numberOfLines={2}>
                {resolvedServer ?? effectiveHost() ?? email.trim()}
              </Text>
            </View>
            <ToggleRow
              label="E-Mail"
              value
              enabled={false}
              onChange={() => undefined}
              s={s}
              t={t}
            />
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
            <PrimaryButton
              label="Konto einrichten"
              busy={busy}
              onPress={() => void finish()}
              s={s}
              t={t}
            />
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
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

function FieldLabel({ text, s }: { text: string; s: Styles }): React.JSX.Element {
  return <Text style={s.fieldLabel}>{text}</Text>;
}

function SectionTitle({ text, s }: { text: string; s: Styles }): React.JSX.Element {
  return <Text style={s.sectionTitle}>{text}</Text>;
}

function ReadonlyRow({ k, v, s }: { k: string; v: string; s: Styles }): React.JSX.Element {
  return (
    <View style={s.readonlyRow}>
      <Text style={s.readonlyKey}>{k}</Text>
      <Text style={s.readonlyVal}>{v}</Text>
    </View>
  );
}

function Segmented({
  options,
  value,
  onChange,
  s,
  t,
}: {
  options: ReadonlyArray<{ key: string; label: string }>;
  value: string;
  onChange: (key: string) => void;
  s: Styles;
  t: AppTheme;
}): React.JSX.Element {
  return (
    <View style={s.segmented}>
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            style={[s.segment, active ? s.segmentActive : null]}
            onPress={() => onChange(opt.key)}
          >
            <Text style={[s.segmentText, active ? { color: t.onBrand } : null]} numberOfLines={1}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
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
    brandRow: { marginBottom: space.md },
    cancelLink: { color: t.c.brandPrimary, fontSize: typography.body.size, fontWeight: '600' },
    cancelRow: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      flexDirection: 'row',
      marginBottom: space.md,
    },
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
    checkBox: {
      alignItems: 'center',
      backgroundColor: t.c.bgElevated,
      borderRadius: radius.sm,
      height: 22,
      justifyContent: 'center',
      marginRight: space.sm,
      width: 22,
    },
    checkBoxOn: { backgroundColor: t.c.brandPrimary },
    checkLabel: { color: t.c.textPrimary, flex: 1, fontSize: typography.caption.size },
    checkRow: { alignItems: 'center', flexDirection: 'row', marginTop: space.sm },
    consentBox: {
      backgroundColor: t.c.bgElevated,
      borderRadius: radius.md,
      marginBottom: space.sm,
      marginTop: space.xs,
      padding: space.md,
    },
    consentHeader: { alignItems: 'center', flexDirection: 'row', marginBottom: space.xs },
    consentText: { color: t.c.textSecondary, fontSize: typography.caption.size },
    consentTitle: {
      color: t.c.textPrimary,
      fontSize: typography.body.size,
      fontWeight: '600',
      marginLeft: space.xs,
    },
    flex: { backgroundColor: t.c.bgCanvas, flex: 1 },
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
    col: { flex: 1 },
    expertBox: {
      backgroundColor: t.c.bgElevated,
      borderRadius: radius.md,
      marginTop: space.xs,
      padding: space.md,
    },
    expertToggle: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: space.md,
      paddingVertical: space.sm,
    },
    expertToggleText: {
      color: t.c.brandPrimary,
      fontSize: typography.body.size,
      fontWeight: '600',
    },
    fieldHint: {
      color: t.c.textSecondary,
      fontSize: typography.caption.size,
      marginBottom: space.xs,
      marginTop: space.xxs,
    },
    fieldLabel: {
      color: t.c.textSecondary,
      fontSize: typography.caption.size,
      marginBottom: space.xxs,
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
    previewBox: {
      backgroundColor: t.c.bgElevated,
      borderRadius: radius.md,
      marginBottom: space.sm,
      marginTop: space.xs,
      padding: space.md,
    },
    previewLabel: { color: t.c.textSecondary, fontSize: typography.caption.size },
    previewValue: { color: t.c.textPrimary, fontSize: typography.body.size, marginTop: space.xxs },
    readonlyKey: { color: t.c.textSecondary, fontSize: typography.body.size },
    readonlyRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: space.sm,
    },
    readonlyVal: { color: t.c.textPrimary, fontSize: typography.body.size, fontWeight: '600' },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: space.lg,
      paddingBottom: space.xxl,
    },
    secondaryLink: {
      color: t.c.brandPrimary,
      fontSize: typography.caption.size,
      marginTop: space.md,
      textAlign: 'center',
    },
    sectionTitle: {
      color: t.c.textPrimary,
      fontSize: typography.body.size,
      fontWeight: '700',
      marginBottom: space.xxs,
      marginTop: space.md,
    },
    segment: {
      alignItems: 'center',
      borderRadius: radius.sm,
      flex: 1,
      paddingHorizontal: space.xs,
      paddingVertical: space.sm,
    },
    segmentActive: { backgroundColor: t.c.brandPrimary },
    segmentText: { color: t.c.textPrimary, fontSize: typography.caption.size, fontWeight: '600' },
    segmented: {
      backgroundColor: t.c.bgElevated,
      borderRadius: radius.md,
      flexDirection: 'row',
      marginBottom: space.xs,
      padding: space.xxs,
    },
    serverInfoBox: {
      backgroundColor: t.c.success + '14',
      borderRadius: radius.sm,
      marginBottom: space.sm,
      padding: space.md,
    },
    serverInfoLabel: { color: t.c.textSecondary, fontSize: typography.caption.size },
    serverInfoUrl: { color: t.c.textPrimary, fontSize: typography.body.size, marginTop: space.xxs },
    subtitle: {
      color: t.c.textPrimary,
      fontSize: typography.headline.size,
      fontWeight: '600',
      marginBottom: space.lg,
    },
    title: {
      color: t.c.brandPrimary,
      fontSize: typography.largeTitle.size,
      fontWeight: '700',
      marginBottom: space.sm,
    },
    toggleLabel: {
      color: t.c.textPrimary,
      flex: 1,
      fontSize: typography.body.size,
      paddingRight: space.sm,
    },
    twoCol: { flexDirection: 'row', gap: space.sm },
    toggleRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: space.sm,
    },
  });
}
