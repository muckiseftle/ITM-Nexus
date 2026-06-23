import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { type AccountId, type MailMessage, type MessageId } from '@nexus/domain';
import { color, radius, space, typography } from '@nexus/ui-kit';
import type { AppContainer } from '../composition/container';

interface Props {
  readonly container: AppContainer;
  readonly account: AccountId;
  readonly onOpenMessage: (messageId: MessageId) => void;
}

/** Hybride Suche (lokal-first) über den getesteten {@link SearchService}; Treffer öffnen die Nachricht. */
export function SearchScreen({ container, account, onOpenMessage }: Props): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly MailMessage[]>([]);
  const [searched, setSearched] = useState(false);

  const run = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length === 0) {
        setResults([]);
        setSearched(false);
        return;
      }
      const hits = await container.search.search(account, trimmed);
      const resolved = await Promise.all(
        hits.map((h) => container.mailStore.getMessage(account, h.messageId)),
      );
      setResults(resolved.filter((m): m is MailMessage => m !== undefined));
      setSearched(true);
    },
    [container, account],
  );

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="E-Mails durchsuchen"
        placeholderTextColor={color.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        value={query}
        onChangeText={(t) => {
          setQuery(t);
          void run(t);
        }}
      />
      <FlatList
        data={results}
        keyExtractor={(m) => m.id}
        contentContainerStyle={results.length === 0 ? styles.emptyWrap : undefined}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {searched ? 'Keine Treffer.' : 'Begriff eingeben, um zu suchen.'}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => {
              onOpenMessage(item.id);
            }}
          >
            <Text numberOfLines={1} style={styles.sender}>
              {item.from.displayName ?? item.from.address}
            </Text>
            <Text numberOfLines={1} style={styles.subject}>
              {item.subject}
            </Text>
            <Text numberOfLines={1} style={styles.preview}>
              {item.preview}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: color.bgCanvas, flex: 1 },
  empty: { color: color.textSecondary, fontSize: typography.body.size, textAlign: 'center' },
  emptyWrap: { flexGrow: 1, justifyContent: 'center', padding: space.lg },
  preview: { color: color.textSecondary, fontSize: typography.caption.size },
  row: {
    borderBottomColor: color.bgElevated,
    borderBottomWidth: 1,
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
  sender: { color: color.textPrimary, fontSize: typography.body.size, fontWeight: '600' },
  subject: { color: color.textPrimary, fontSize: typography.body.size },
});
