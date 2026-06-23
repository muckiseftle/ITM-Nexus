import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { type AccountId, type CalendarEvent } from '@nexus/domain';
import { color, space, typography } from '@nexus/ui-kit';
import type { AppContainer } from '../composition/container';

interface Props {
  readonly container: AppContainer;
  readonly account: AccountId;
}

const DAY = 86_400_000;

function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

/** Agenda der nächsten 30 Tage aus dem getesteten {@link CalendarService}. */
export function CalendarScreen({ container, account }: Props): React.JSX.Element {
  const [events, setEvents] = useState<readonly CalendarEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const now = Date.now();
    const list = await container.calendar.agenda(account, now - DAY, now + 30 * DAY);
    setEvents(list);
  }, [container, account]);

  const sync = useCallback(async () => {
    setRefreshing(true);
    try {
      await container.calendar.sync(account);
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [container, account, load]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <FlatList
      data={events}
      keyExtractor={(e) => e.id}
      contentContainerStyle={events.length === 0 ? styles.emptyWrap : undefined}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void sync()} />}
      ListEmptyComponent={<Text style={styles.empty}>Keine Termine im Zeitraum.</Text>}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.when}>
            <Text style={styles.day}>{formatDay(item.startAt)}</Text>
            <Text style={styles.time}>
              {item.isAllDay ? 'Ganztägig' : formatTime(item.startAt)}
            </Text>
          </View>
          <View style={styles.body}>
            <Text numberOfLines={1} style={styles.subject}>
              {item.subject}
            </Text>
            {item.location !== undefined ? (
              <Text numberOfLines={1} style={styles.location}>
                {item.location}
              </Text>
            ) : null}
            <Text numberOfLines={1} style={styles.organizer}>
              {item.organizer.displayName ?? item.organizer.address}
            </Text>
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  day: { color: color.textPrimary, fontSize: typography.caption.size, fontWeight: '600' },
  empty: { color: color.textSecondary, fontSize: typography.body.size, textAlign: 'center' },
  emptyWrap: { flexGrow: 1, justifyContent: 'center', padding: space.lg },
  location: { color: color.textSecondary, fontSize: typography.caption.size },
  organizer: { color: color.textSecondary, fontSize: typography.caption.size },
  row: {
    borderBottomColor: color.bgElevated,
    borderBottomWidth: 1,
    flexDirection: 'row',
    padding: space.md,
  },
  subject: { color: color.textPrimary, fontSize: typography.body.size, fontWeight: '600' },
  time: { color: color.brandPrimary, fontSize: typography.caption.size },
  when: { marginRight: space.md, width: 92 },
});
