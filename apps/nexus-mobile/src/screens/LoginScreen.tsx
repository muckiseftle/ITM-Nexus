import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { isValidEmail, toAccountId, type AccountId } from '@nexus/domain';
import {
  classifyError,
  domainFromEmail,
  normalizeEwsUrl,
  parseLogin,
  type Credentials,
  type ErrorInfo,
} from '@nexus/core-transport';
import { radius, space, typography } from '@nexus/ui-kit';
import type { AppContainer } from '../composition/container';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface Props {
  readonly container: AppContainer;
  readonly onLoggedIn: (accountId: AccountId, email: string) => void;
}

/** Schritte der Einrichtung: erst E-Mail, dann Anmeldung; manueller Server nur bei Bedarf. */
type Step = 'email' | 'credentials' | 'manual';

/**
 * Konto-Einrichtung (Live-Modus) als geführter Fluss:
 *
 * 1. **E-Mail** – nur die Adresse abfragen.
 * 2. **Anmeldung** – Passwort eingeben; Autodiscover ermittelt den Server automatisch und
 *    eine echte, authentifizierte Anmeldeprüfung bestätigt die Zugangsdaten.
 * 3. **Manuell** – nur falls Autodiscover den Server nicht findet: Serveradresse von Hand.
 *
 * Erst wenn die Anmeldung serverseitig bestätigt ist, wird das Konto geöffnet. Das Secret
 * landet ausschließlich im SecureStore (Keychain).
 */
export function LoginScreen({ container, onLoggedIn }: Props): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [resolvedServer, setResolvedServer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);

  const fail = (title: string, detail: string, technical: string): void => {
    setError({ kind: 'unknown', title, detail, technical });
  };

  /** Üblicher Standard-Hostname für die manuelle Eingabe (editierbar vorbefüllt). */
  const defaultServerHost = (forEmail: string): string | undefined => {
    const domain = domainFromEmail(forEmail);
    return domain !== undefined ? `mail.${domain}` : undefined;
  };

  // Schritt 1 → 2: E-Mail prüfen, dann zur Anmeldung.
  const continueFromEmail = (): void => {
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      fail('E-Mail prüfen', 'Bitte eine gültige E-Mail-Adresse eingeben.', `ungültig: ${trimmed}`);
      return;
    }
    setError(null);
    setStep('credentials');
  };

  // Baut die Credentials und führt Autodiscover + echte Anmeldeprüfung aus.
  const attempt = async (withManualServer: boolean): Promise<void> => {
    const trimmedEmail = email.trim();
    if (password.length === 0) {
      fail('Passwort fehlt', 'Bitte dein Passwort eingeben.', 'leeres Passwort');
      return;
    }

    const loginName = username.trim().length > 0 ? username.trim() : trimmedEmail;
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
        return;
      }
    }

    const credentials: Credentials = {
      username: loginName,
      secret: password,
      scheme,
      ...(login.form === 'downlevel' && login.domain !== undefined ? { domain: login.domain } : {}),
      ...(manualEws !== undefined ? { manual: { ewsUrl: manualEws } } : {}),
    };

    setBusy(true);
    setError(null);
    setShowTechnical(false);
    try {
      // Schritt 1: Endpunkt ermitteln und die gefundene Server-URL sichtbar machen.
      const discovered = await container.setup.discover(trimmedEmail, credentials);
      setResolvedServer(discovered.ewsUrl ?? manualEws ?? null);
      // Schritt 2: echte Anmeldeprüfung + Speichern (nur bei Erfolg).
      await container.setup.completeSetup(trimmedEmail, credentials, discovered);
      onLoggedIn(toAccountId(trimmedEmail.toLowerCase()), trimmedEmail);
    } catch (e: unknown) {
      const info = classifyError(e);
      setError(info);
      // Server per Autodiscover nicht auffindbar → in den manuellen Schritt wechseln und
      // einen sinnvollen Standard-Host vorbefüllen, den der Nutzer prüfen/anpassen kann.
      if (info.kind === 'autodiscover' && step !== 'manual') {
        if (serverUrl.trim().length === 0) {
          const host = defaultServerHost(trimmedEmail);
          if (host !== undefined) setServerUrl(host);
        }
        setStep('manual');
      }
    } finally {
      setBusy(false);
    }
  };

  const serverInfo =
    resolvedServer !== null ? (
      <View style={s.serverInfoBox}>
        <Text style={s.serverInfoLabel}>Ermittelter Server</Text>
        <Text style={s.serverInfoUrl} numberOfLines={2}>
          {resolvedServer}
        </Text>
      </View>
    ) : null;

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
      <Text style={s.title}>NEXUS</Text>

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
            Wir ermitteln deinen Server automatisch über die E-Mail-Adresse (Autodiscover).
          </Text>
        </>
      ) : null}

      {step === 'credentials' ? (
        <>
          <View style={s.accountRow}>
            <Text style={s.accountEmail} numberOfLines={1}>
              {email.trim()}
            </Text>
            <Pressable onPress={() => setStep('email')} hitSlop={6}>
              <Text style={s.changeLink}>Ändern</Text>
            </Pressable>
          </View>
          <Text style={s.subtitle}>Passwort eingeben</Text>
          <TextInput
            style={s.input}
            placeholder="Passwort"
            placeholderTextColor={t.c.textSecondary}
            secureTextEntry
            autoFocus
            value={password}
            onChangeText={setPassword}
          />
          <TextInput
            style={s.input}
            placeholder="Benutzername (optional, z. B. DOMÄNE\Benutzer)"
            placeholderTextColor={t.c.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
          />
          {serverInfo}
          {errorBox}
          <Pressable
            style={[s.button, busy ? s.buttonDisabled : null]}
            disabled={busy}
            onPress={() => void attempt(false)}
          >
            {busy ? (
              <ActivityIndicator color={t.onBrand} />
            ) : (
              <Text style={s.buttonText}>Anmelden</Text>
            )}
          </Pressable>
          <Pressable onPress={() => setStep('manual')} hitSlop={6}>
            <Text style={s.secondaryLink}>Server manuell eingeben</Text>
          </Pressable>
        </>
      ) : null}

      {step === 'manual' ? (
        <>
          <View style={s.accountRow}>
            <Text style={s.accountEmail} numberOfLines={1}>
              {email.trim()}
            </Text>
            <Pressable onPress={() => setStep('credentials')} hitSlop={6}>
              <Text style={s.changeLink}>Zurück</Text>
            </Pressable>
          </View>
          <Text style={s.subtitle}>Serveradresse manuell festlegen</Text>
          <TextInput
            style={s.input}
            placeholder="EWS-/Server-Adresse (z. B. mail.firma.de)"
            placeholderTextColor={t.c.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            keyboardType="url"
            value={serverUrl}
            onChangeText={setServerUrl}
          />
          <TextInput
            style={s.input}
            placeholder="Passwort"
            placeholderTextColor={t.c.textSecondary}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <TextInput
            style={s.input}
            placeholder="Benutzername (optional, z. B. DOMÄNE\Benutzer)"
            placeholderTextColor={t.c.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
          />
          <Text style={s.advancedHint}>
            Nutze diesen Schritt nur, wenn Autodiscover im Firmennetz nicht freigegeben ist.
          </Text>
          {serverInfo}
          {errorBox}
          <Pressable
            style={[s.button, busy ? s.buttonDisabled : null]}
            disabled={busy}
            onPress={() => void attempt(true)}
          >
            {busy ? (
              <ActivityIndicator color={t.onBrand} />
            ) : (
              <Text style={s.buttonText}>Anmelden</Text>
            )}
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    accountEmail: { color: t.c.textPrimary, flex: 1, fontSize: typography.body.size, fontWeight: '600' },
    accountRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: space.sm,
    },
    advancedHint: { color: t.c.textSecondary, fontSize: typography.caption.size, marginBottom: space.sm },
    button: {
      alignItems: 'center',
      backgroundColor: t.c.brandPrimary,
      borderRadius: radius.md,
      marginTop: space.sm,
      paddingVertical: space.md,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: t.onBrand, fontSize: typography.body.size, fontWeight: '600' },
    changeLink: { color: t.c.brandPrimary, fontSize: typography.caption.size, fontWeight: '600' },
    container: { backgroundColor: t.c.bgCanvas, flex: 1, justifyContent: 'center', padding: space.lg },
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
    errorTechnical: { color: t.c.textSecondary, fontSize: typography.caption.size, marginTop: space.xs },
    errorTitle: { color: t.c.danger, fontSize: typography.body.size, fontWeight: '700' },
    errorToggle: { color: t.c.brandPrimary, fontSize: typography.caption.size, marginTop: space.xs },
    hint: { color: t.c.textSecondary, fontSize: typography.caption.size, marginTop: space.md, textAlign: 'center' },
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
    title: { color: t.c.brandPrimary, fontSize: 34, fontWeight: '700', marginBottom: space.sm },
  });
}
