import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { toAccountId, type AccountId } from '@nexus/domain';
import { classifyError, type ErrorInfo } from '@nexus/core-transport';
import { color, radius, space, typography } from '@nexus/ui-kit';
import type { AppContainer } from '../composition/container';

interface Props {
  readonly container: AppContainer;
  readonly onLoggedIn: (accountId: AccountId, email: string) => void;
}

/**
 * Konto-Einrichtung (Live-Modus): E-Mail + Passwort → Autodiscover → Anmeldung. Das Secret
 * landet ausschließlich im SecureStore (Keychain). Bei Erfolg wird die Mailbox geöffnet.
 */
export function LoginScreen({ container, onLoggedIn }: Props): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
    // Anmeldename: separat eingebbar (z. B. DOMÄNE\Benutzername oder UPN). Leer → E-Mail.
    const loginName = username.trim().length > 0 ? username.trim() : trimmedEmail;
    setBusy(true);
    setError(null);
    setShowTechnical(false);
    try {
      await container.setup.setUp(trimmedEmail, {
        username: loginName,
        secret: password,
        scheme: 'basic',
      });
      onLoggedIn(toAccountId(trimmedEmail.toLowerCase()), trimmedEmail);
    } catch (e: unknown) {
      setError(classifyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>NEXUS</Text>
      <Text style={styles.subtitle}>Bei Exchange anmelden</Text>

      <TextInput
        style={styles.input}
        placeholder="E-Mail-Adresse (für Autodiscover)"
        placeholderTextColor={color.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Benutzername (optional, z. B. DOMÄNE\Benutzer)"
        placeholderTextColor={color.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        value={username}
        onChangeText={setUsername}
      />
      <TextInput
        style={styles.input}
        placeholder="Passwort"
        placeholderTextColor={color.textSecondary}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error !== null ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>{error.title}</Text>
          <Text style={styles.errorDetail}>{error.detail}</Text>
          {error.hint !== undefined ? <Text style={styles.errorHint}>{error.hint}</Text> : null}
          <Pressable
            onPress={() => {
              setShowTechnical((v) => !v);
            }}
          >
            <Text style={styles.errorToggle}>
              {showTechnical ? 'Details ausblenden' : 'Technische Details'}
            </Text>
          </Pressable>
          {showTechnical ? <Text style={styles.errorTechnical}>{error.technical}</Text> : null}
        </View>
      ) : null}

      <Pressable
        style={[styles.button, busy ? styles.buttonDisabled : null]}
        disabled={busy}
        onPress={() => void submit()}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>Anmelden</Text>
        )}
      </Pressable>

      <Text style={styles.hint}>
        Autodiscover ermittelt deinen Server automatisch. Falls die Anmeldung scheitert,
        Benutzername als DOMÄNE\Benutzer oder benutzer@domäne eingeben.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: color.brandPrimary,
    borderRadius: radius.md,
    marginTop: space.sm,
    paddingVertical: space.md,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontSize: typography.body.size, fontWeight: '600' },
  container: {
    backgroundColor: color.bgCanvas,
    flex: 1,
    justifyContent: 'center',
    padding: space.lg,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderColor: color.danger,
    borderLeftWidth: 3,
    borderRadius: radius.sm,
    marginBottom: space.sm,
    padding: space.md,
  },
  errorDetail: { color: color.textPrimary, fontSize: typography.body.size, marginTop: space.xxs },
  errorHint: { color: color.textSecondary, fontSize: typography.caption.size, marginTop: space.xs },
  errorTechnical: {
    color: color.textSecondary,
    fontSize: typography.caption.size,
    marginTop: space.xs,
  },
  errorTitle: { color: color.danger, fontSize: typography.body.size, fontWeight: '700' },
  errorToggle: {
    color: color.brandPrimary,
    fontSize: typography.caption.size,
    marginTop: space.xs,
  },
  hint: {
    color: color.textSecondary,
    fontSize: typography.caption.size,
    marginTop: space.md,
    textAlign: 'center',
  },
  input: {
    backgroundColor: color.bgElevated,
    borderRadius: radius.md,
    color: color.textPrimary,
    fontSize: typography.body.size,
    marginBottom: space.sm,
    padding: space.md,
  },
  subtitle: { color: color.textSecondary, fontSize: typography.body.size, marginBottom: space.lg },
  title: { color: color.brandPrimary, fontSize: 34, fontWeight: '700' },
});
