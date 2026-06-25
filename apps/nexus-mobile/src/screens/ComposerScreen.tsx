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
  isValidEmail,
  parseRecipients,
  type AccountId,
  type Mailbox,
  type MessageId,
  type Recipient,
} from '@nexus/domain';
import { classifyError, type ErrorInfo } from '@nexus/core-transport';
import { radius, space, typography } from '@nexus/ui-kit';
import type { AppContainer } from '../composition/container';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

/** Vorbelegung des Composers (z. B. aus Antworten/Weiterleiten abgeleitet). */
export interface ComposerInitial {
  readonly to?: string;
  readonly cc?: string;
  readonly subject?: string;
  readonly body?: string;
  readonly inReplyTo?: MessageId;
  /** Titel in der Kopfzeile (z. B. „Antworten", „Weiterleiten"). */
  readonly title?: string;
}

interface Props {
  readonly container: AppContainer;
  readonly account: AccountId;
  readonly accountEmail: string;
  readonly initial?: ComposerInitial;
  readonly onClose: () => void;
  readonly onSent: () => void;
}

let composeCounter = 0;

/** Validiert die geparsten Empfänger; liefert ungültige Roh-Adressen zurück. */
function invalidAddresses(recipients: readonly Recipient[]): string[] {
  return recipients.filter((r) => !isValidEmail(r.address.address)).map((r) => r.address.address);
}

function normalize(recipients: readonly Recipient[]): Recipient[] {
  return recipients.map((r) => ({
    kind: r.kind,
    address: createMailAddress(r.address.address, r.address.displayName),
  }));
}

/**
 * Verfassen/Antworten/Weiterleiten mit An/Cc/Bcc. Baut die Empfängerliste (mit
 * Empfänger-Art) und übergibt sie an die getestete {@link ComposeService}, die die
 * Sende-Identität auflöst und die Nachricht in die Outbox stellt. Danach wird die Outbox
 * geleert (im Demo-Modus ein No-op-Versand).
 */
export function ComposerScreen({
  container,
  account,
  accountEmail,
  initial,
  onClose,
  onSent,
}: Props): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  const [to, setTo] = useState(initial?.to ?? '');
  const [cc, setCc] = useState(initial?.cc ?? '');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [bodyText, setBodyText] = useState(initial?.body ?? '');
  const [ccVisible, setCcVisible] = useState((initial?.cc ?? '').length > 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);

  const fail = (title: string, detail: string, technical: string): void => {
    setError({ kind: 'unknown', title, detail, technical });
  };

  const submit = async (): Promise<void> => {
    const recipients: Recipient[] = [
      ...parseRecipients(to, 'to'),
      ...parseRecipients(cc, 'cc'),
      ...parseRecipients(bcc, 'bcc'),
    ];
    if (recipients.length === 0) {
      fail(
        'Empfänger fehlt',
        'Bitte mindestens eine Empfänger-Adresse angeben.',
        'leerer Empfänger',
      );
      return;
    }
    const invalid = invalidAddresses(recipients);
    if (invalid.length > 0) {
      fail(
        'Ungültige Adresse',
        `Bitte prüfen: ${invalid.join(', ')}`,
        `ungültig: ${invalid.join(',')}`,
      );
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
        recipients: normalize(recipients),
        ...(initial?.inReplyTo !== undefined ? { inReplyTo: initial.inReplyTo } : {}),
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
        <Text style={s.barTitle}>{initial?.title ?? 'Neue E-Mail'}</Text>
        <Pressable onPress={() => void submit()} disabled={busy} hitSlop={8}>
          {busy ? (
            <ActivityIndicator color={t.c.brandPrimary} />
          ) : (
            <Text style={s.barSend}>Senden</Text>
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.labelRow}>
          <Text style={s.label}>An</Text>
          {!ccVisible ? (
            <Pressable onPress={() => setCcVisible(true)} hitSlop={8}>
              <Text style={s.ccToggle}>Cc/Bcc</Text>
            </Pressable>
          ) : null}
        </View>
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

        {ccVisible ? (
          <>
            <Text style={s.label}>Cc</Text>
            <TextInput
              style={s.input}
              placeholder="kopie@firma.de"
              placeholderTextColor={t.c.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={cc}
              onChangeText={setCc}
            />
            <Text style={s.label}>Bcc</Text>
            <TextInput
              style={s.input}
              placeholder="blindkopie@firma.de"
              placeholderTextColor={t.c.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={bcc}
              onChangeText={setBcc}
            />
          </>
        ) : null}

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
    ccToggle: { color: t.c.brandPrimary, fontSize: typography.caption.size, fontWeight: '600' },
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
    errorDetail: {
      color: t.c.textPrimary,
      fontSize: typography.caption.size,
      marginTop: space.xxs,
    },
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
    labelRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
  });
}
