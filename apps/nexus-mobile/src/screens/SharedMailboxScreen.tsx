import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { messageBodyToText, type AccountId, type MailMessage } from '@nexus/domain';
import { radius, space, typography } from '@nexus/ui-kit';
import type { AppContainer } from '../composition/container';
import { SharedMailboxError } from '../composition/sharedMailboxes';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface Props {
  readonly container: AppContainer;
  readonly account: AccountId;
  readonly email: string;
  readonly displayName: string;
  readonly onBack: () => void;
}

/**
 * Nur-Lese-Ansicht des Posteingangs eines freigegebenen Postfachs (EWS-Delegation). Die Daten
 * werden live geladen (nicht lokal gespeichert) und der Server erzwingt die Zugriffsrechte —
 * fehlt die Berechtigung, erscheint statt der Liste ein klarer Hinweis.
 */
export function SharedMailboxScreen({
  container,
  account,
  email,
  displayName,
  onBack,
}: Props): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const [messages, setMessages] = useState<readonly MailMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<MailMessage | null>(null);

  useEffect(() => {
    let active = true;
    setMessages(null);
    setError(null);
    void container.sharedMailboxes
      ?.loadInbox(account, email)
      .then((m) => {
        if (active) setMessages(m);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(
          e instanceof SharedMailboxError && e.reason === 'forbidden'
            ? 'Keine Berechtigung mehr für dieses Postfach.'
            : 'Posteingang konnte nicht geladen werden.',
        );
        setMessages([]);
      });
    return () => {
      active = false;
    };
  }, [container, account, email]);

  if (open !== null) {
    return (
      <View style={s.container}>
        <Pressable style={s.back} onPress={() => setOpen(null)} hitSlop={8}>
          <Text style={s.backText}>‹ {displayName}</Text>
        </Pressable>
        <ScrollView contentContainerStyle={s.content}>
          <Text style={s.subject}>{open.subject || '(kein Betreff)'}</Text>
          <Text style={s.meta}>{open.from.displayName ?? open.from.address}</Text>
          <Text style={s.body}>{messageBodyToText(open)}</Text>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <Pressable style={s.back} onPress={onBack} hitSlop={8}>
        <Text style={s.backText}>‹ Zurück</Text>
      </Pressable>
      <View style={s.header}>
        <Text style={s.title} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={s.sub} numberOfLines={1}>
          {email} · Freigegeben · Nur lesen
        </Text>
      </View>
      {messages === null ? (
        <View style={s.centered}>
          <ActivityIndicator color={t.c.brandPrimary} />
        </View>
      ) : error !== null ? (
        <Text style={s.error}>{error}</Text>
      ) : messages.length === 0 ? (
        <Text style={s.empty}>Keine Nachrichten.</Text>
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {messages.map((m) => (
            <Pressable key={m.id} style={s.row} onPress={() => setOpen(m)}>
              <Text style={s.rowFrom} numberOfLines={1}>
                {m.from.displayName ?? m.from.address}
              </Text>
              <Text style={s.rowSubject} numberOfLines={1}>
                {m.subject || '(kein Betreff)'}
              </Text>
              <Text style={s.rowPreview} numberOfLines={1}>
                {m.preview}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    back: { paddingHorizontal: space.md, paddingVertical: space.sm },
    backText: { color: t.c.brandPrimary, fontSize: typography.body.size },
    body: {
      color: t.c.textPrimary,
      fontSize: typography.body.size,
      lineHeight: 22,
      marginTop: space.md,
    },
    centered: { alignItems: 'center', flex: 1, justifyContent: 'center' },
    container: { backgroundColor: t.c.bgCanvas, flex: 1 },
    content: { padding: space.md },
    empty: { color: t.c.textSecondary, padding: space.lg, textAlign: 'center' },
    error: { color: t.c.danger, padding: space.lg, textAlign: 'center' },
    header: {
      borderBottomColor: t.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      paddingBottom: space.sm,
      paddingHorizontal: space.md,
    },
    list: { paddingBottom: space.xl },
    meta: { color: t.c.textSecondary, fontSize: typography.caption.size, marginTop: space.xs },
    row: {
      borderBottomColor: t.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
    },
    rowFrom: { color: t.c.textPrimary, fontSize: typography.body.size, fontWeight: '600' },
    rowPreview: { color: t.c.textSecondary, fontSize: typography.caption.size, marginTop: 1 },
    rowSubject: { color: t.c.textPrimary, fontSize: typography.body.size, marginTop: 1 },
    sub: { color: t.c.textSecondary, fontSize: typography.caption.size, marginTop: 2 },
    subject: { color: t.c.textPrimary, fontSize: typography.headline.size, fontWeight: '700' },
    title: { color: t.c.textPrimary, fontSize: typography.headline.size, fontWeight: '700' },
  });
}
