import React, { useMemo, useState } from 'react';
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
import { radius, space, typography } from '@nexus/ui-kit';
import type { AppContainer } from '../composition/container';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

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
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

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
    <View style={s.container}>
      <View style={s.bar}>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={s.barAction}>Abbrechen</Text>
        </Pressable>
        <Text style={s.barTitle}>{replyTo ? 'Antworten' : 'Neue E-Mail'}</Text>
        <Pressable onPress={() => void submit()} disabled={busy} hitSlop={8}>
          {busy ? (
            <ActivityIndicator color={t.c.brandPrimary} />
          ) : (
            <Text style={s.barSend}>Senden</Text>
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.label}>An</Text>
        <TextInput
          style={s.input}
          placeholder="empfaenger@firma.de"
          placeholderTextColor={t.c.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={to}
          onChangeText={setTo}
        />
        <Text style={s.label}>Betreff</Text>
        <TextInput
          style={s.input}
          placeholder="Betreff"
          placeholderTextColor={t.c.textSecondary}
          value={subject}
          onChangeText={setSubject}
        />
        <Text style={s.label}>Nachricht</Text>
        <TextInput
          style={[s.input, s.body]}
          placeholder="Text verfassen…"
          placeholderTextColor={t.c.textSecondary}
          multiline
          textAlignVertical="top"
          value={bodyText}
          onChangeText={setBodyText}
        />

        {error !== null ? (
          <View style={s.errorBox}>
            <Text style={s.errorTitle}>{error.title}</Text>
            <Text style={s.errorDetail}>{error.detail}</Text>
          </View>
        ) : null}

        <Text style={s.from}>Von: {accountEmail}</Text>
      </ScrollView>
    </View>
  );
}

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    bar: {
      alignItems: 'center',
      borderBottomColor: t.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
    },
    barAction: { color: t.c.textSecondary, fontSize: typography.body.size },
    barSend: { color: t.c.brandPrimary, fontSize: typography.body.size, fontWeight: '700' },
    barTitle: { color: t.c.textPrimary, fontSize: typography.body.size, fontWeight: '600' },
    body: { minHeight: 200 },
    container: { backgroundColor: t.c.bgCanvas, flex: 1 },
    content: { padding: space.md },
    errorBox: {
      backgroundColor: t.c.danger + '14',
      borderColor: t.c.danger,
      borderLeftWidth: 3,
      borderRadius: radius.sm,
      marginTop: space.sm,
      padding: space.md,
    },
    errorDetail: { color: t.c.textPrimary, fontSize: typography.caption.size, marginTop: space.xxs },
    errorTitle: { color: t.c.danger, fontSize: typography.body.size, fontWeight: '700' },
    from: { color: t.c.textSecondary, fontSize: typography.caption.size, marginTop: space.md },
    input: {
      backgroundColor: t.c.bgElevated,
      borderRadius: radius.md,
      color: t.c.textPrimary,
      fontSize: typography.body.size,
      marginBottom: space.sm,
      padding: space.md,
    },
    label: { color: t.c.textSecondary, fontSize: typography.caption.size, marginBottom: space.xxs },
  });
}
