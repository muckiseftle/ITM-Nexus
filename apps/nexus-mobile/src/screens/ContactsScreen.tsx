import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { type AccountId, type Contact } from '@nexus/domain';
import { space, typography } from '@nexus/ui-kit';
import type { AppContainer } from '../composition/container';
import { ScreenHeader } from '../components/ScreenHeader';
import { Avatar } from '../components/Avatar';
import { Press } from '../components/Press';
import { FAB } from '../components/FAB';
import { ContactDetailScreen } from './ContactDetailScreen';
import { ContactEditScreen } from './ContactEditScreen';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface Props {
  readonly container: AppContainer;
  readonly account: AccountId;
}

type Route =
  | { name: 'list' }
  | { name: 'detail'; contact: Contact }
  | { name: 'edit'; contact?: Contact };

/** Kontaktliste mit Suche, Detailansicht und Anlegen/Bearbeiten/Löschen (intern navigiert). */
export function ContactsScreen({ container, account }: Props): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState<readonly Contact[]>([]);
  const [route, setRoute] = useState<Route>({ name: 'list' });

  const canEdit = container.createContact !== undefined;

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

  // Nach Schreibvorgängen: Liste neu laden und (für die Detailansicht) den frischen Kontakt holen.
  const reloadAndFind = useCallback(
    async (id: string): Promise<Contact | undefined> => {
      const list = await container.contacts.search(account, '');
      setContacts(list);
      return list.find((c) => c.id === id);
    },
    [container, account],
  );

  const onSave = useCallback(
    async (contact: Contact): Promise<void> => {
      if (contact.id.length > 0 && container.updateContact !== undefined) {
        await container.updateContact(account, contact);
        const fresh = await reloadAndFind(contact.id);
        setRoute(fresh !== undefined ? { name: 'detail', contact: fresh } : { name: 'list' });
        return;
      }
      if (container.createContact !== undefined) {
        const saved = await container.createContact(account, contact);
        await reloadAndFind(saved.id);
        setRoute({ name: 'detail', contact: saved });
        return;
      }
      setRoute({ name: 'list' });
    },
    [container, account, reloadAndFind],
  );

  const onDelete = useCallback(
    (contact: Contact): void => {
      if (container.deleteContact === undefined) return;
      void container
        .deleteContact(account, contact.id)
        .then(() => load(''))
        .catch(() => undefined);
      setRoute({ name: 'list' });
    },
    [container, account, load],
  );

  if (route.name === 'detail') {
    return (
      <ContactDetailScreen
        contact={route.contact}
        canEdit={canEdit}
        onBack={() => setRoute({ name: 'list' })}
        onEdit={() => setRoute({ name: 'edit', contact: route.contact })}
        onDelete={() => onDelete(route.contact)}
      />
    );
  }

  if (route.name === 'edit') {
    return (
      <ContactEditScreen
        account={account}
        {...(route.contact !== undefined ? { contact: route.contact } : {})}
        onCancel={() =>
          setRoute(
            route.contact !== undefined
              ? { name: 'detail', contact: route.contact }
              : { name: 'list' },
          )
        }
        onSave={onSave}
      />
    );
  }

  return (
    <View style={s.container}>
      <ScreenHeader
        title="Kontakte"
        search={{ value: query, onChange: setQuery, placeholder: 'Kontakte durchsuchen' }}
      />
      <FlatList
        data={contacts}
        keyExtractor={(c) => c.id}
        contentContainerStyle={contacts.length === 0 ? s.emptyWrap : s.listContent}
        ListEmptyComponent={<Text style={s.empty}>Keine Kontakte gefunden.</Text>}
        renderItem={({ item }) => (
          <Press style={s.row} onPress={() => setRoute({ name: 'detail', contact: item })}>
            <Avatar
              name={item.displayName}
              colorKey={item.emailAddresses[0]?.address ?? item.displayName}
              size={44}
            />
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
          </Press>
        )}
      />
      {canEdit ? <FAB icon="plus" onPress={() => setRoute({ name: 'edit' })} /> : null}
    </View>
  );
}

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    body: { flex: 1, minWidth: 0 },
    company: { color: t.c.textSecondary, fontSize: typography.caption.size },
    container: { backgroundColor: t.c.bgCanvas, flex: 1 },
    empty: { color: t.c.textSecondary, fontSize: typography.body.size, textAlign: 'center' },
    emptyWrap: { flexGrow: 1, justifyContent: 'center', padding: space.lg },
    listContent: { paddingBottom: 96 },
    mail: { color: t.c.textSecondary, fontSize: typography.caption.size },
    name: { color: t.c.textPrimary, fontSize: typography.body.size, fontWeight: '600' },
    row: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: space.sm,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
    },
  });
}
