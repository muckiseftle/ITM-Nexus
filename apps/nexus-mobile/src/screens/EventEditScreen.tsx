import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  createMailAddress,
  parseRecipients,
  toEventId,
  type AccountId,
  type CalendarEvent,
} from '@nexus/domain';
import { radius, space, typography } from '@nexus/ui-kit';
import { Icon } from '../components/Icon';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface Props {
  readonly account: AccountId;
  readonly accountEmail: string;
  readonly event?: CalendarEvent;
  /** Vorausgewähltes Startdatum (Tagesbeginn) beim Neuanlegen. */
  readonly initialDay?: number;
  readonly onCancel: () => void;
  readonly onSave: (event: CalendarEvent) => Promise<void>;
}

const HOUR = 3_600_000;
const MIN = 60_000;
const DAY = 86_400_000;

const fmtDate = (ms: number): string =>
  new Date(ms).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
const fmtTime = (ms: number): string =>
  new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

/** Nächste volle Stunde ab jetzt (sinnvoller Standard für neue Termine). */
function nextHour(base: number): number {
  const d = new Date(base);
  d.setMinutes(0, 0, 0);
  return d.getTime() + HOUR;
}

/** Eine Stepper-Schaltfläche (− / +). */
function Step({
  label,
  onPress,
  s,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly s: Styles;
}): React.JSX.Element {
  return (
    <Pressable style={s.step} onPress={onPress} hitSlop={4}>
      <Text style={s.stepText}>{label}</Text>
    </Pressable>
  );
}

/** Datum/Uhrzeit über Stepper anpassen (ohne native Picker-Abhängigkeit). */
function DateTimeRow({
  title,
  value,
  showTime,
  onAdjust,
  s,
}: {
  readonly title: string;
  readonly value: number;
  readonly showTime: boolean;
  readonly onAdjust: (deltaMs: number) => void;
  readonly s: Styles;
}): React.JSX.Element {
  return (
    <View style={s.dtWrap}>
      <Text style={s.label}>{title}</Text>
      <Text style={s.dtValue}>
        {fmtDate(value)}
        {showTime ? ` · ${fmtTime(value)}` : ''}
      </Text>
      <View style={s.stepRow}>
        <Step label="−1 Tag" onPress={() => onAdjust(-DAY)} s={s} />
        <Step label="+1 Tag" onPress={() => onAdjust(DAY)} s={s} />
        {showTime ? (
          <>
            <Step label="−1 Std" onPress={() => onAdjust(-HOUR)} s={s} />
            <Step label="+1 Std" onPress={() => onAdjust(HOUR)} s={s} />
            <Step label="−15 Min" onPress={() => onAdjust(-15 * MIN)} s={s} />
            <Step label="+15 Min" onPress={() => onAdjust(15 * MIN)} s={s} />
          </>
        ) : null}
      </View>
    </View>
  );
}

/** Termin anlegen oder bearbeiten — Formular über die getesteten Container-Schreibmethoden. */
export function EventEditScreen({
  account,
  accountEmail,
  event,
  initialDay,
  onCancel,
  onSave,
}: Props): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  const defaultStart = useMemo(
    () => (initialDay !== undefined ? initialDay + 9 * HOUR : nextHour(Date.now())),
    [initialDay],
  );
  const [subject, setSubject] = useState(event?.subject ?? '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [attendees, setAttendees] = useState(
    event?.attendees.map((a) => a.address).join(', ') ?? '',
  );
  const [isAllDay, setIsAllDay] = useState(event?.isAllDay ?? false);
  const [start, setStart] = useState(event?.startAt ?? defaultStart);
  const [end, setEnd] = useState(event?.endAt ?? defaultStart + HOUR);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start verschieben: Ende um dieselbe Dauer mitschieben.
  const adjustStart = (delta: number): void => {
    setStart((prev) => prev + delta);
    setEnd((prev) => prev + delta);
  };
  const adjustEnd = (delta: number): void => {
    setEnd((prev) => Math.max(start + 15 * MIN, prev + delta));
  };

  const save = async (): Promise<void> => {
    if (busy) return;
    if (subject.trim().length === 0) {
      setError('Bitte einen Titel angeben.');
      return;
    }
    const parsed = attendees.trim().length > 0 ? parseRecipients(attendees, 'to') : [];
    const attendeeAddrs = parsed.map((r) => createMailAddress(r.address.address));
    const built: CalendarEvent = {
      id: event?.id ?? toEventId(''),
      accountId: account,
      subject: subject.trim(),
      startAt: start,
      endAt: isAllDay ? start + DAY : end,
      isAllDay,
      organizer: event?.organizer ?? createMailAddress(accountEmail),
      attendees: attendeeAddrs,
      ...(location.trim().length > 0 ? { location: location.trim() } : {}),
      ...(notes.trim().length > 0 ? { notes: notes.trim() } : {}),
      ...(attendeeAddrs.length > 0 ? { isMeeting: true } : {}),
      ...(event?.changeKey !== undefined ? { changeKey: event.changeKey } : {}),
    };
    setBusy(true);
    setError(null);
    try {
      await onSave(built);
    } catch {
      setError('Speichern fehlgeschlagen. Bitte erneut versuchen.');
      setBusy(false);
    }
  };

  return (
    <View style={s.container}>
      <View style={s.bar}>
        <Pressable onPress={onCancel} hitSlop={8}>
          <Text style={s.barAction}>Abbrechen</Text>
        </Pressable>
        <Text style={s.barTitle}>{event !== undefined ? 'Termin bearbeiten' : 'Neuer Termin'}</Text>
        <Pressable onPress={() => void save()} disabled={busy} hitSlop={8}>
          {busy ? (
            <ActivityIndicator color={t.c.brandPrimary} />
          ) : (
            <Text style={s.barSave}>Sichern</Text>
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.label}>Titel</Text>
        <TextInput
          style={s.input}
          value={subject}
          onChangeText={setSubject}
          placeholder="Titel"
          placeholderTextColor={t.c.textSecondary}
          autoFocus
        />

        <View style={s.allDayRow}>
          <Text style={s.allDayLabel}>Ganztägig</Text>
          <Switch
            value={isAllDay}
            onValueChange={setIsAllDay}
            trackColor={{ true: t.c.brandPrimary, false: t.border }}
          />
        </View>

        <DateTimeRow
          title="Beginn"
          value={start}
          showTime={!isAllDay}
          onAdjust={adjustStart}
          s={s}
        />
        {!isAllDay ? (
          <DateTimeRow title="Ende" value={end} showTime onAdjust={adjustEnd} s={s} />
        ) : null}

        <Text style={s.label}>Ort</Text>
        <TextInput
          style={s.input}
          value={location}
          onChangeText={setLocation}
          placeholder="Ort (optional)"
          placeholderTextColor={t.c.textSecondary}
        />

        <Text style={s.label}>Teilnehmer (E-Mail, kommagetrennt)</Text>
        <TextInput
          style={s.input}
          value={attendees}
          onChangeText={setAttendees}
          placeholder="z. B. anna@firma.de, ben@firma.de"
          placeholderTextColor={t.c.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />

        <Text style={s.label}>Notiz</Text>
        <TextInput
          style={[s.input, s.notes]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Beschreibung (optional)"
          placeholderTextColor={t.c.textSecondary}
          multiline
          textAlignVertical="top"
        />

        {error !== null ? (
          <View style={s.errorRow}>
            <Icon name="x" size={16} color={t.c.danger} />
            <Text style={s.error}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    allDayLabel: { color: t.c.textPrimary, fontSize: typography.body.size },
    allDayRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: space.sm,
    },
    bar: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
    },
    barAction: { color: t.c.textSecondary, fontSize: typography.body.size },
    barSave: { color: t.c.brandPrimary, fontSize: typography.body.size, fontWeight: '700' },
    barTitle: { color: t.c.textPrimary, fontSize: typography.body.size, fontWeight: '600' },
    container: { backgroundColor: t.c.bgCanvas, flex: 1 },
    content: { padding: space.md, paddingBottom: 118 },
    dtValue: { color: t.c.textPrimary, fontSize: typography.body.size, fontWeight: '600' },
    dtWrap: {
      backgroundColor: t.c.card,
      borderRadius: radius.md,
      gap: space.xs,
      marginBottom: space.sm,
      padding: space.md,
    },
    error: { color: t.c.danger, fontSize: typography.caption.size },
    errorRow: { alignItems: 'center', flexDirection: 'row', gap: space.xs, marginTop: space.sm },
    input: {
      backgroundColor: t.c.bgElevated,
      borderRadius: radius.md,
      color: t.c.textPrimary,
      fontSize: typography.body.size,
      marginBottom: space.sm,
      padding: space.md,
    },
    label: { color: t.c.textSecondary, fontSize: typography.caption.size, marginBottom: space.xxs },
    notes: { minHeight: 90 },
    step: {
      backgroundColor: t.c.bgElevated,
      borderRadius: radius.pill,
      paddingHorizontal: space.sm,
      paddingVertical: 6,
    },
    stepRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
    stepText: { color: t.c.brandPrimary, fontSize: typography.caption.size, fontWeight: '600' },
  });
}
