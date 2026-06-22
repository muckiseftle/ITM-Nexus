import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { toAccountId, type AccountId } from '@nexus/domain';
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
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    const trimmed = email.trim();
    if (trimmed.length === 0 || password.length === 0) {
      setError('Bitte E-Mail und Passwort eingeben.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await container.setup.setUp(trimmed, {
        username: trimmed,
        secret: password,
        scheme: 'basic',
      });
      onLoggedIn(toAccountId(trimmed.toLowerCase()), trimmed);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen');
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
        placeholder="E-Mail-Adresse"
        placeholderTextColor={color.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Passwort"
        placeholderTextColor={color.textSecondary}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error !== null ? <Text style={styles.error}>{error}</Text> : null}

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

      <Text style={styles.hint}>Autodiscover ermittelt deinen Server automatisch.</Text>
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
  error: { color: color.danger, marginBottom: space.sm },
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
