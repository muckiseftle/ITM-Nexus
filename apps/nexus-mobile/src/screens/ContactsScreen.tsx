import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { type AccountId, type Contact } from '@nexus/domain';
import { color, radius, space, typography } from '@nexus/ui-kit';
import type { AppContainer } from '../composition/container';

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

/** Kontaktliste mit lokaler Suche über den getesteten {@link ContactsService}. */
export function ContactsScreen({ container, account }: Props): React.JSX.Element {
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
    void load(query);
  }, [load, query]);

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Kontakte durchsuchen"
        placeholderTextColor={color.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        value={query}
        onChangeText={setQuery}
      />
      <FlatList
        data={contacts}
        keyExtractor={(c) => c.id}
        contentContainerStyle={contacts.length === 0 ? styles.emptyWrap : undefined}
        ListEmptyComponent={<Text style={styles.empty}>Keine Kontakte gefunden.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(item.displayName)}</Text>
            </View>
            <View style={styles.body}>
              <Text numberOfLines={1} style={styles.name}>
                {item.displayName}
              </Text>
              <Text numberOfLines={1} style={styles.mail}>
                {item.emailAddresses[0]?.address ?? '—'}
              </Text>
              {item.company !== undefined ? (
                <Text numberOfLines={1} style={styles.company}>
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

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    backgroundColor: color.brandPrimary,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    marginRight: space.md,
    width: 40,
  },
  avatarText: { color: '#FFFFFF', fontSize: typography.caption.size, fontWeight: '700' },
  body: { flex: 1 },
  company: { color: color.textSecondary, fontSize: typography.caption.size },
  container: { backgroundColor: color.bgCanvas, flex: 1 },
  empty: { color: color.textSecondary, fontSize: typography.body.size, textAlign: 'center' },
  emptyWrap: { flexGrow: 1, justifyContent: 'center', padding: space.lg },
  mail: { color: color.textSecondary, fontSize: typography.caption.size },
  name: { color: color.textPrimary, fontSize: typography.body.size, fontWeight: '600' },
  row: {
    alignItems: 'center',
    borderBottomColor: color.bgElevated,
    borderBottomWidth: 1,
    flexDirection: 'row',
    padding: space.md,
  },
  search: {
    backgroundColor: color.bgElevated,
    borderRadius: radius.md,
    color: color.textPrimary,
    fontSize: typography.body.size,
    margin: space.md,
    padding: space.md,
  },
});
