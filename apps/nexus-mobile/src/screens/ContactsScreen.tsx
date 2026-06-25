import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { type AccountId, type Contact } from '@nexus/domain';
import { radius, space, typography } from '@nexus/ui-kit';
import type { AppContainer } from '../composition/container';
import { ScreenHeader } from '../components/ScreenHeader';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface Props {
  readonly container: AppContainer;
  readonly account: AccountId;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

/** Kontaktliste mit Header-Suche über den getesteten {@link ContactsService}. */
export function ContactsScreen({ container, account }: Props): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState<readonly Contact[]>([]);

  const load = useCallback(
    async (q: string) => {
      const list = await container.contacts.search(account, q.trim());
      setContacts(list);
    },
    [container, account],
  );

  useEffect(() => {
    void load(query).catch(() => undefined);
  }, [load, query]);

  return (
    <View style={s.container}>
      <ScreenHeader
        title="Kontakte"
        search={{ value: query, onChange: setQuery, placeholder: 'Kontakte durchsuchen' }}
      />
      <FlatList
        data={contacts}
        keyExtractor={(c) => c.id}
        contentContainerStyle={contacts.length === 0 ? s.emptyWrap : undefined}
        ListEmptyComponent={<Text style={s.empty}>Keine Kontakte gefunden.</Text>}
        renderItem={({ item }) => (
          <View style={s.row}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{initials(item.displayName)}</Text>
            </View>
            <View style={s.body}>
              <Text numberOfLines={1} style={s.name}>
                {item.displayName}
              </Text>
              <Text numberOfLines={1} style={s.mail}>
                {item.emailAddresses[0]?.address ?? '—'}
              </Text>
              {item.company !== undefined ? (
                <Text numberOfLines={1} style={s.company}>
                  {item.company}
                </Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    avatar: {
      alignItems: 'center',
      backgroundColor: t.c.brandPrimary,
      borderRadius: radius.pill,
      height: 40,
      justifyContent: 'center',
      marginRight: space.md,
      width: 40,
    },
    avatarText: { color: t.onBrand, fontSize: typography.caption.size, fontWeight: '700' },
    body: { flex: 1, minWidth: 0 },
    company: { color: t.c.textSecondary, fontSize: typography.caption.size },
    container: { backgroundColor: t.c.bgCanvas, flex: 1 },
    empty: { color: t.c.textSecondary, fontSize: typography.body.size, textAlign: 'center' },
    emptyWrap: { flexGrow: 1, justifyContent: 'center', padding: space.lg },
    mail: { color: t.c.textSecondary, fontSize: typography.caption.size },
    name: { color: t.c.textPrimary, fontSize: typography.body.size, fontWeight: '600' },
    row: {
      alignItems: 'center',
      borderBottomColor: t.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      padding: space.md,
    },
  });
}
