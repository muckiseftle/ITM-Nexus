import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { toAccountId, type AccountId } from '@nexus/domain';
import {
  classifyError,
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

/**
 * Konto-Einrichtung (Live-Modus): E-Mail + Passwort → Autodiscover → Anmeldung. Das Secret
 * landet ausschließlich im SecureStore (Keychain). Bei Erfolg wird die Mailbox geöffnet.
 */
export function LoginScreen({ container, onLoggedIn }: Props): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);

  const submit = async (): Promise<void> => {
    const trimmedEmail = email.trim();
    if (trimmedEmail.length === 0 || password.length === 0) {
      setError({
        kind: 'unknown',
        title: 'Angaben fehlen',
        detail: 'Bitte E-Mail-Adresse und Passwort eingeben.',
        technical: 'leere Eingabe',
      });
      return;
    }
    const loginName = username.trim().length > 0 ? username.trim() : trimmedEmail;
    const login = parseLogin(loginName);
    const scheme = login.form === 'downlevel' ? 'ntlm' : 'basic';

    const manualEws = normalizeEwsUrl(serverUrl);
    if (serverUrl.trim().length > 0 && manualEws === undefined) {
      setError({
        kind: 'unknown',
        title: 'Server-Adresse ungültig',
        detail: 'Bitte eine gültige EWS-/Server-URL eingeben (z. B. mail.firma.de).',
        technical: serverUrl,
      });
      return;
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
      await container.setup.setUp(trimmedEmail, credentials);
      onLoggedIn(toAccountId(trimmedEmail.toLowerCase()), trimmedEmail);
    } catch (e: unknown) {
      setError(classifyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.container}>
      <Text style={s.title}>NEXUS</Text>
      <Text style={s.subtitle}>Bei Exchange anmelden</Text>

      <TextInput
        style={s.input}
        placeholder="E-Mail-Adresse (für Autodiscover)"
        placeholderTextColor={t.c.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
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
      <TextInput
        style={s.input}
        placeholder="Passwort"
        placeholderTextColor={t.c.textSecondary}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <Pressable
        onPress={() => {
          setShowAdvanced((v) => !v);
        }}
        hitSlop={6}
      >
        <Text style={s.advancedToggle}>
          {showAdvanced ? '▾ Erweitert' : '▸ Erweitert (Server manuell)'}
        </Text>
      </Pressable>
      {showAdvanced ? (
        <>
          <TextInput
            style={s.input}
            placeholder="EWS-/Server-Adresse (optional, z. B. mail.firma.de)"
            placeholderTextColor={t.c.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            value={serverUrl}
            onChangeText={setServerUrl}
          />
          <Text style={s.advancedHint}>
            Nur ausfüllen, wenn Autodiscover im Firmennetz nicht funktioniert. Leer lassen für
            automatische Servererkennung.
          </Text>
        </>
      ) : null}

      {error !== null ? (
        <View style={s.errorBox}>
          <Text style={s.errorTitle}>{error.title}</Text>
          <Text style={s.errorDetail}>{error.detail}</Text>
          {error.hint !== undefined ? <Text style={s.errorHint}>{error.hint}</Text> : null}
          <Pressable
            onPress={() => {
              setShowTechnical((v) => !v);
            }}
          >
            <Text style={s.errorToggle}>
              {showTechnical ? 'Details ausblenden' : 'Technische Details'}
            </Text>
          </Pressable>
          {showTechnical ? <Text style={s.errorTechnical}>{error.technical}</Text> : null}
        </View>
      ) : null}

      <Pressable
        style={[s.button, busy ? s.buttonDisabled : null]}
        disabled={busy}
        onPress={() => void submit()}
      >
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.buttonText}>Anmelden</Text>}
      </Pressable>

      <Text style={s.hint}>
        Autodiscover ermittelt deinen Server automatisch. Falls die Anmeldung scheitert,
        Benutzername als DOMÄNE\Benutzer oder benutzer@domäne eingeben.
      </Text>
    </View>
  );
}

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    advancedHint: { color: t.c.textSecondary, fontSize: typography.caption.size, marginBottom: space.sm },
    advancedToggle: { color: t.c.brandPrimary, fontSize: typography.caption.size, marginBottom: space.sm },
    button: {
      alignItems: 'center',
      backgroundColor: t.c.brandPrimary,
      borderRadius: radius.md,
      marginTop: space.sm,
      paddingVertical: space.md,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: t.onBrand, fontSize: typography.body.size, fontWeight: '600' },
    container: { backgroundColor: t.c.bgCanvas, flex: 1, justifyContent: 'center', padding: space.lg },
    errorBox: {
      backgroundColor: t.c.danger + '14',
      borderColor: t.c.danger,
      borderLeftWidth: 3,
      borderRadius: radius.sm,
      marginBottom: space.sm,
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
    subtitle: { color: t.c.textSecondary, fontSize: typography.body.size, marginBottom: space.lg },
    title: { color: t.c.brandPrimary, fontSize: 34, fontWeight: '700' },
  });
}
