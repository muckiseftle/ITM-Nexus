import React, { useMemo } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type Contact } from '@nexus/domain';
import { radius, space, typography } from '@nexus/ui-kit';
import { Avatar } from '../components/Avatar';
import { Icon, type IconName } from '../components/Icon';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface Props {
  readonly contact: Contact;
  readonly onBack: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  /** Ob Bearbeiten/Löschen verfügbar sind (Container-Schreibmethoden vorhanden). */
  readonly canEdit: boolean;
}

/** Eine antippbare Detailzeile (E-Mail/Telefon) mit Icon + Aktion. */
function DetailRow({
  icon,
  label,
  value,
  onPress,
  s,
  t,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly value: string;
  readonly onPress?: () => void;
  readonly s: Styles;
  readonly t: AppTheme;
}): React.JSX.Element {
  return (
    <Pressable style={s.row} onPress={onPress} disabled={onPress === undefined}>
      <Icon name={icon} size={20} color={t.c.textSecondary} />
      <View style={s.rowBody}>
        <Text style={s.rowLabel}>{label}</Text>
        <Text style={[s.rowValue, onPress !== undefined ? s.rowValueLink : null]} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </Pressable>
  );
}

/** Vollständige Kontaktdetails mit Schnellaktionen (mailen/anrufen) und Bearbeiten/Löschen. */
export function ContactDetailScreen({
  contact,
  onBack,
  onEdit,
  onDelete,
  canEdit,
}: Props): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  const open = (url: string): void => void Linking.openURL(url).catch(() => undefined);
  const confirmDelete = (): void => {
    Alert.alert('Kontakt löschen', `„${contact.displayName}" wirklich löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: onDelete },
    ]);
  };

  const email = contact.emailAddresses[0]?.address;
  const subtitle =
    [contact.jobTitle, contact.company]
      .filter((x) => x !== undefined && x.length > 0)
      .join(' · ') || undefined;

  return (
    <View style={s.container}>
      <View style={s.bar}>
        <Pressable style={s.back} onPress={onBack} hitSlop={8}>
          <Icon name="chevronLeft" size={22} color={t.c.brandPrimary} />
          <Text style={s.backText}>Kontakte</Text>
        </Pressable>
        {canEdit ? (
          <Pressable onPress={onEdit} hitSlop={8}>
            <Text style={s.edit}>Bearbeiten</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={s.content}>
        <View style={s.hero}>
          <Avatar name={contact.displayName} colorKey={email ?? contact.displayName} size={84} />
          <Text style={s.name}>{contact.displayName}</Text>
          {subtitle !== undefined ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        </View>

        <View style={s.card}>
          {email !== undefined ? (
            <DetailRow
              icon="mail"
              label="E-Mail"
              value={email}
              onPress={() => open(`mailto:${email}`)}
              s={s}
              t={t}
            />
          ) : null}
          {contact.mobilePhone !== undefined ? (
            <DetailRow
              icon="user"
              label="Mobil"
              value={contact.mobilePhone}
              onPress={() => open(`tel:${contact.mobilePhone ?? ''}`)}
              s={s}
              t={t}
            />
          ) : null}
          {contact.businessPhone !== undefined ? (
            <DetailRow
              icon="user"
              label="Geschäftlich"
              value={contact.businessPhone}
              onPress={() => open(`tel:${contact.businessPhone ?? ''}`)}
              s={s}
              t={t}
            />
          ) : null}
          {contact.homePhone !== undefined ? (
            <DetailRow
              icon="user"
              label="Privat"
              value={contact.homePhone}
              onPress={() => open(`tel:${contact.homePhone ?? ''}`)}
              s={s}
              t={t}
            />
          ) : null}
          {contact.company !== undefined ? (
            <DetailRow icon="shield" label="Firma" value={contact.company} s={s} t={t} />
          ) : null}
          {contact.notes !== undefined ? (
            <DetailRow icon="edit" label="Notiz" value={contact.notes} s={s} t={t} />
          ) : null}
        </View>

        {canEdit ? (
          <Pressable style={s.deleteBtn} onPress={confirmDelete}>
            <Icon name="trash" size={18} color={t.c.danger} />
            <Text style={s.deleteText}>Kontakt löschen</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    back: { alignItems: 'center', flexDirection: 'row', gap: 2 },
    backText: { color: t.c.brandPrimary, fontSize: typography.body.size },
    bar: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: space.md,
      paddingVertical: space.xs,
    },
    card: {
      backgroundColor: t.c.card,
      borderRadius: radius.lg,
      marginTop: space.lg,
      overflow: 'hidden',
    },
    container: { backgroundColor: t.c.bgCanvas, flex: 1 },
    content: { padding: space.md, paddingBottom: space.xl },
    deleteBtn: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: space.xs,
      justifyContent: 'center',
      marginTop: space.lg,
      paddingVertical: space.md,
    },
    deleteText: { color: t.c.danger, fontSize: typography.body.size, fontWeight: '600' },
    edit: { color: t.c.brandPrimary, fontSize: typography.body.size, fontWeight: '600' },
    hero: { alignItems: 'center', gap: space.xs, paddingTop: space.md },
    name: { color: t.c.textPrimary, fontSize: typography.title.size, fontWeight: '700' },
    row: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: space.sm,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
    },
    rowBody: { flex: 1, minWidth: 0 },
    rowLabel: { color: t.c.textSecondary, fontSize: typography.caption.size },
    rowValue: { color: t.c.textPrimary, fontSize: typography.body.size, marginTop: 1 },
    rowValueLink: { color: t.c.brandPrimary },
    subtitle: { color: t.c.textSecondary, fontSize: typography.body.size },
  });
}
