import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  BodyType,
  createMailAddress,
  type AccountId,
  type MailMessage,
  type Mailbox,
} from '@nexus/domain';
import { classifyError, type ErrorInfo } from '@nexus/core-transport';
import { color, radius, space, typography } from '@nexus/ui-kit';
import type { AppContainer } from '../composition/container';

interface Props {
  readonly container: AppContainer;
  readonly account: AccountId;
  readonly accountEmail: string;
  /** Wenn gesetzt: Antwort auf diese Nachricht (To/Subject/inReplyTo vorbelegt). */
  readonly replyTo?: MailMessage;
  readonly onClose: () => void;
  readonly onSent: () => void;
}

let composeCounter = 0;

/**
 * Verfassen/Antworten. Baut einen {@link Draft} und übergibt ihn an die getestete
 * {@link ComposeService}, die die Sende-Identität auflöst und die Nachricht in die Outbox
 * stellt. Anschließend wird die Outbox geleert (im Demo-Modus ein No-op-Versand).
 */
export function ComposerScreen({
  container,
  account,
  accountEmail,
  replyTo,
  onClose,
  onSent,
}: Props): React.JSX.Element {
  const [to, setTo] = useState(replyTo ? replyTo.from.address : '');
  const [subject, setSubject] = useState(
    replyTo ? (replyTo.subject.startsWith('Re:') ? replyTo.subject : `Re: ${replyTo.subject}`) : '',
  );
  const [bodyText, setBodyText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);

  const submit = async (): Promise<void> => {
    const recipient = to.trim();
    if (recipient.length === 0) {
      setError({
        kind: 'unknown',
        title: 'Empfänger fehlt',
        detail: 'Bitte mindestens eine Empfänger-Adresse angeben.',
        technical: 'leerer Empfänger',
      });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const primaryAddress = createMailAddress(accountEmail);
      const mailbox: Mailbox = {
        id: account,
        kind: 'primary',
        address: primaryAddress,
        displayName: accountEmail,
        permissions: ['read', 'write', 'sendAs'],
      };
      composeCounter += 1;
      const operationId = `compose-${String(Date.now())}-${String(composeCounter)}`;
      await container.compose.send(account, operationId, mailbox, primaryAddress, {
        subject: subject.trim(),
        body: { type: BodyType.Text, content: bodyText },
        recipients: [{ kind: 'to', address: createMailAddress(recipient) }],
        ...(replyTo ? { inReplyTo: replyTo.id } : {}),
      });
      await container.outbox.drain(account);
      onSent();
    } catch (e: unknown) {
      setError(classifyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.bar}>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={styles.barAction}>Abbrechen</Text>
        </Pressable>
        <Text style={styles.barTitle}>{replyTo ? 'Antworten' : 'Neue E-Mail'}</Text>
        <Pressable onPress={() => void submit()} disabled={busy} hitSlop={8}>
          {busy ? (
            <ActivityIndicator color={color.brandPrimary} />
          ) : (
            <Text style={styles.barSend}>Senden</Text>
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>An</Text>
        <TextInput
          style={styles.input}
          placeholder="empfaenger@firma.de"
          placeholderTextColor={color.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={to}
          onChangeText={setTo}
        />
        <Text style={styles.label}>Betreff</Text>
        <TextInput
          style={styles.input}
          placeholder="Betreff"
          placeholderTextColor={color.textSecondary}
          value={subject}
          onChangeText={setSubject}
        />
        <Text style={styles.label}>Nachricht</Text>
        <TextInput
          style={[styles.input, styles.body]}
          placeholder="Text verfassen…"
          placeholderTextColor={color.textSecondary}
          multiline
          textAlignVertical="top"
          value={bodyText}
          onChangeText={setBodyText}
        />

        {error !== null ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>{error.title}</Text>
            <Text style={styles.errorDetail}>{error.detail}</Text>
          </View>
        ) : null}

        <Text style={styles.from}>Von: {accountEmail}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    borderBottomColor: color.bgElevated,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  barAction: { color: color.textSecondary, fontSize: typography.body.size },
  barSend: { color: color.brandPrimary, fontSize: typography.body.size, fontWeight: '700' },
  barTitle: { color: color.textPrimary, fontSize: typography.body.size, fontWeight: '600' },
  body: { minHeight: 200 },
  container: { backgroundColor: color.bgCanvas, flex: 1 },
  content: { padding: space.md },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderColor: color.danger,
    borderLeftWidth: 3,
    borderRadius: radius.sm,
    marginTop: space.sm,
    padding: space.md,
  },
  errorDetail: {
    color: color.textPrimary,
    fontSize: typography.caption.size,
    marginTop: space.xxs,
  },
  errorTitle: { color: color.danger, fontSize: typography.body.size, fontWeight: '700' },
  from: { color: color.textSecondary, fontSize: typography.caption.size, marginTop: space.md },
  input: {
    backgroundColor: color.bgElevated,
    borderRadius: radius.md,
    color: color.textPrimary,
    fontSize: typography.body.size,
    marginBottom: space.sm,
    padding: space.md,
  },
  label: { color: color.textSecondary, fontSize: typography.caption.size, marginBottom: space.xxs },
});
