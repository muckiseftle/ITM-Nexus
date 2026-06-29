import React, { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type CalendarEvent, type EventResponse } from '@nexus/domain';
import { radius, space, typography } from '@nexus/ui-kit';
import { Icon, type IconName } from '../components/Icon';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface Props {
  readonly event: CalendarEvent;
  readonly onBack: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly onRespond: (response: 'accept' | 'decline' | 'tentative') => void;
  readonly canEdit: boolean;
}

const fmtDate = (ms: number): string =>
  new Date(ms).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
const fmtTime = (ms: number): string =>
  new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

const RESPONSE_LABEL: Record<EventResponse, string> = {
  accept: 'Zugesagt',
  decline: 'Abgelehnt',
  tentative: 'Mit Vorbehalt',
  organizer: 'Organisator',
  none: 'Keine Antwort',
  unknown: '',
};

/** Eine Detailzeile mit Icon + Inhalt. */
function Row({
  icon,
  children,
  s,
  t,
}: {
  readonly icon: IconName;
  readonly children: React.ReactNode;
  readonly s: Styles;
  readonly t: AppTheme;
}): React.JSX.Element {
  return (
    <View style={s.row}>
      <Icon name={icon} size={20} color={t.c.textSecondary} />
      <View style={s.rowBody}>{children}</View>
    </View>
  );
}

/** Termin-Detailansicht mit Annehmen/Ablehnen/Vielleicht (Besprechungen) und Bearbeiten/Löschen. */
export function EventDetailScreen({
  event,
  onBack,
  onEdit,
  onDelete,
  onRespond,
  canEdit,
}: Props): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  const when = event.isAllDay
    ? `${fmtDate(event.startAt)} · Ganztägig`
    : `${fmtDate(event.startAt)}\n${fmtTime(event.startAt)} – ${fmtTime(event.endAt)}`;
  const isMeeting = event.isMeeting === true;
  const myResponse = event.myResponse ?? 'unknown';
  const canRespond = isMeeting && myResponse !== 'organizer';

  const confirmDelete = (): void => {
    Alert.alert('Termin löschen', `„${event.subject}" wirklich löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: onDelete },
    ]);
  };

  const respondBtn = (
    key: 'accept' | 'tentative' | 'decline',
    label: string,
    icon: IconName,
    color: string,
  ): React.JSX.Element => {
    const active = myResponse === key;
    // Aktiv-Zustand nur über Flächenfüllung (KEIN Rahmen auf gerundeter Fläche → iOS-26-Crash).
    return (
      <Pressable
        style={[s.respBtn, { backgroundColor: color + (active ? '33' : '14') }]}
        onPress={() => onRespond(key)}
      >
        <Icon name={icon} size={18} color={color} />
        <Text style={[s.respText, { color }]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={s.container}>
      <View style={s.bar}>
        <Pressable style={s.back} onPress={onBack} hitSlop={8}>
          <Icon name="chevronLeft" size={22} color={t.c.brandPrimary} />
          <Text style={s.backText}>Kalender</Text>
        </Pressable>
        {canEdit ? (
          <Pressable onPress={onEdit} hitSlop={8}>
            <Text style={s.edit}>Bearbeiten</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>{event.subject.length > 0 ? event.subject : '(Kein Titel)'}</Text>
        {event.isCancelled === true ? <Text style={s.cancelled}>Abgesagt</Text> : null}

        <View style={s.card}>
          <Row icon="clock" s={s} t={t}>
            <Text style={s.value}>{when}</Text>
          </Row>
          {event.location !== undefined ? (
            <Row icon="inbox" s={s} t={t}>
              <Text style={s.value}>{event.location}</Text>
            </Row>
          ) : null}
          <Row icon="user" s={s} t={t}>
            <Text style={s.rowLabel}>Organisator</Text>
            <Text style={s.value}>{event.organizer.displayName ?? event.organizer.address}</Text>
          </Row>
          {event.attendees.length > 0 ? (
            <Row icon="contacts" s={s} t={t}>
              <Text style={s.rowLabel}>Teilnehmer ({event.attendees.length})</Text>
              <Text style={s.value}>
                {event.attendees.map((a) => a.displayName ?? a.address).join(', ')}
              </Text>
            </Row>
          ) : null}
          {isMeeting && RESPONSE_LABEL[myResponse].length > 0 ? (
            <Row icon="check" s={s} t={t}>
              <Text style={s.rowLabel}>Mein Status</Text>
              <Text style={s.value}>{RESPONSE_LABEL[myResponse]}</Text>
            </Row>
          ) : null}
          {event.notes !== undefined ? (
            <Row icon="edit" s={s} t={t}>
              <Text style={s.value}>{event.notes}</Text>
            </Row>
          ) : null}
        </View>

        {canRespond ? (
          <View style={s.respRow}>
            {respondBtn('accept', 'Annehmen', 'check', t.c.success)}
            {respondBtn('tentative', 'Vielleicht', 'clock', t.c.warning)}
            {respondBtn('decline', 'Ablehnen', 'x', t.c.danger)}
          </View>
        ) : null}

        {canEdit ? (
          <Pressable style={s.deleteBtn} onPress={confirmDelete}>
            <Icon name="trash" size={18} color={t.c.danger} />
            <Text style={s.deleteText}>Termin löschen</Text>
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
    cancelled: {
      color: t.c.danger,
      fontSize: typography.body.size,
      fontWeight: '700',
      marginTop: 2,
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
    respBtn: {
      alignItems: 'center',
      borderRadius: radius.md,
      flex: 1,
      flexDirection: 'row',
      gap: 4,
      justifyContent: 'center',
      paddingVertical: space.sm,
    },
    respRow: { flexDirection: 'row', gap: space.xs, marginTop: space.lg },
    respText: { fontSize: typography.caption.size, fontWeight: '700' },
    row: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: space.sm,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
    },
    rowBody: { flex: 1, minWidth: 0 },
    rowLabel: { color: t.c.textSecondary, fontSize: typography.caption.size },
    title: { color: t.c.textPrimary, fontSize: typography.title.size, fontWeight: '700' },
    value: { color: t.c.textPrimary, fontSize: typography.body.size },
  });
}
