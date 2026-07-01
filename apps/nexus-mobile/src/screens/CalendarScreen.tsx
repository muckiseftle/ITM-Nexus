import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, ScrollView, Text, View } from 'react-native';
import { type AccountId, type CalendarEvent } from '@nexus/domain';
import { space, typography } from '@nexus/ui-kit';
import type { AppContainer } from '../composition/container';
import type { SharedMailbox } from '../composition/sharedMailboxes';
import { ScreenHeader } from '../components/ScreenHeader';
import { Icon, IconButton } from '../components/Icon';
import { BottomSheet } from '../components/BottomSheet';
import { Segmented } from '../components/Segmented';
import { Press } from '../components/Press';
import { FAB } from '../components/FAB';
import { useChrome } from '../components/Chrome';
import { EventDetailScreen } from './EventDetailScreen';
import { EventEditScreen } from './EventEditScreen';
import { paletteColor, useTheme, type AppTheme } from '../theme/ThemeContext';

type CalView = 'list' | 'day' | 'week' | 'month';

type EventRoute =
  | { name: 'calendar' }
  | { name: 'detail'; event: CalendarEvent }
  | { name: 'edit'; event?: CalendarEvent; day?: number };

interface Props {
  readonly container: AppContainer;
  readonly account: AccountId;
  /** E-Mail des aktiven Kontos — als Organisator beim Anlegen neuer Termine. */
  readonly accountEmail: string;
  /** Zuletzt gespeicherte Ansicht (aus den Einstellungen) — Startwert. */
  readonly initialView?: CalView;
  /** Wird bei jedem Ansichtswechsel aufgerufen, damit die Wahl persistiert werden kann. */
  readonly onViewChange?: (view: CalView) => void;
  /** Freigegebene Postfächer des Kontos — als wählbare Kalenderquellen. */
  readonly sharedMailboxes?: readonly SharedMailbox[];
  /** Aktivierte freigegebene Kalender (E-Mail-Adressen). */
  readonly calendarSources?: readonly string[];
  /** Auswahl der freigegebenen Kalender ändern (persistiert). */
  readonly onCalendarSourcesChange?: (next: readonly string[]) => void;
}

const DAY = 86_400_000;
const VIEWS: readonly { readonly key: CalView; readonly label: string }[] = [
  { key: 'list', label: 'Liste' },
  { key: 'day', label: 'Tag' },
  { key: 'week', label: 'Woche' },
  { key: 'month', label: 'Monat' },
];

const dStart = (ms: number): number => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const mondayOf = (ms: number): number => {
  const d0 = dStart(ms);
  const wd = (new Date(d0).getDay() + 6) % 7;
  return d0 - wd * DAY;
};
function isoWeek(ms: number): number {
  const d = new Date(dStart(ms));
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round((d.getTime() - week1.getTime()) / DAY / 7);
}
const hm = (ms: number): string =>
  new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const longDay = (ms: number): string =>
  new Date(ms).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' });

/** Kalender mit vier Ansichten und farbigen Terminen (Farbe je Organisator). */
export function CalendarScreen({
  container,
  account,
  accountEmail,
  initialView,
  onViewChange,
  sharedMailboxes,
  calendarSources,
  onCalendarSourcesChange,
}: Props): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const { handleScroll } = useChrome();
  const today = useMemo(() => dStart(Date.now()), []);
  const [route, setRoute] = useState<EventRoute>({ name: 'calendar' });
  const canEdit = container.createEvent !== undefined;
  const shared = sharedMailboxes ?? [];
  const sources = calendarSources ?? [];
  const loadCalendar = container.sharedMailboxes?.loadCalendar;
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sharedEvents, setSharedEvents] = useState<readonly CalendarEvent[]>([]);
  const sourcesKey = sources.join(',');

  const [view, setViewState] = useState<CalView>(initialView ?? 'list');
  // Ansicht wechseln UND die Wahl persistieren (über den Eltern-Callback).
  const setView = useCallback(
    (next: CalView) => {
      setViewState(next);
      onViewChange?.(next);
    },
    [onViewChange],
  );
  const [selected, setSelected] = useState<number>(today);
  const [events, setEvents] = useState<readonly CalendarEvent[]>([]);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const from = dStart(selected) - 31 * DAY;
    const to = dStart(selected) + 62 * DAY;
    const list = await container.calendar.agenda(account, from, to);
    setEvents(list);
  }, [container, account, selected]);

  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  // Termine der aktivierten freigegebenen Kalender laden und überlagern.
  useEffect(() => {
    if (loadCalendar === undefined || sources.length === 0) {
      setSharedEvents([]);
      return;
    }
    let active = true;
    void (async () => {
      const all: CalendarEvent[] = [];
      for (const email of sources) {
        try {
          const evs = await loadCalendar(account, email);
          all.push(...evs);
        } catch {
          /* fehlende Berechtigung/Fehler → diese Quelle überspringen */
        }
      }
      if (active) setSharedEvents(all);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, sourcesKey, loadCalendar]);

  const toggleSource = useCallback(
    (email: string): void => {
      const next = sources.includes(email)
        ? sources.filter((e) => e !== email)
        : [...sources, email];
      onCalendarSourcesChange?.(next);
    },
    [sources, onCalendarSourcesChange],
  );

  const openDetail = useCallback((e: CalendarEvent) => setRoute({ name: 'detail', event: e }), []);

  const onSaveEvent = useCallback(
    async (event: CalendarEvent): Promise<void> => {
      if (event.id.length > 0 && container.updateEvent !== undefined) {
        await container.updateEvent(account, event);
        await load();
        setRoute({ name: 'detail', event });
        return;
      }
      if (container.createEvent !== undefined) {
        const saved = await container.createEvent(account, event);
        await load();
        setRoute({ name: 'detail', event: saved });
        return;
      }
      setRoute({ name: 'calendar' });
    },
    [container, account, load],
  );

  const onDeleteEvent = useCallback(
    (event: CalendarEvent): void => {
      if (container.deleteEvent === undefined) return;
      void container
        .deleteEvent(account, event)
        .then(load)
        .catch(() => undefined);
      setRoute({ name: 'calendar' });
    },
    [container, account, load],
  );

  const onRespondEvent = useCallback(
    (event: CalendarEvent, response: 'accept' | 'decline' | 'tentative'): void => {
      if (container.respondEvent === undefined) return;
      void container
        .respondEvent(account, event, response)
        .then(load)
        .catch(() => undefined);
      setRoute({ name: 'detail', event: { ...event, myResponse: response } });
    },
    [container, account, load],
  );

  const evColor = useCallback(
    (e: CalendarEvent): string => paletteColor(t.calPalette, e.organizer.address),
    [t.calPalette],
  );

  // Eigene + freigegebene Termine zusammenführen (Quelle färbt über Organisator-Palette).
  const merged = useMemo(() => [...events, ...sharedEvents], [events, sharedEvents]);
  const filtered = useMemo(() => {
    const n = query.trim().toLowerCase();
    if (n.length === 0) return merged;
    return merged.filter(
      (e) => e.subject.toLowerCase().includes(n) || (e.location ?? '').toLowerCase().includes(n),
    );
  }, [merged, query]);

  // Termine EINMAL nach Tagesbeginn bucketen (statt 42× O(events)-Scan pro Monats-Render).
  const byDay = useMemo(() => {
    const m = new Map<number, CalendarEvent[]>();
    for (const e of filtered) {
      const d0 = dStart(e.startAt);
      const arr = m.get(d0);
      if (arr) arr.push(e);
      else m.set(d0, [e]);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.startAt - b.startAt);
    return m;
  }, [filtered]);

  const evOn = useCallback((d0: number): CalendarEvent[] => byDay.get(d0) ?? [], [byDay]);

  const eventChip = (e: CalendarEvent): React.JSX.Element => {
    const cc = evColor(e);
    const when = e.isAllDay ? 'Ganztägig' : `${hm(e.startAt)}–${hm(e.endAt)}`;
    return (
      <Press
        key={e.id}
        style={[s.evc, { backgroundColor: cc + '22' }]}
        onPress={() => openDetail(e)}
      >
        <View style={[s.edot, { backgroundColor: cc }]} />
        <View style={s.evBody}>
          <Text numberOfLines={1} style={s.evTitle}>
            {e.subject}
          </Text>
          <Text numberOfLines={1} style={s.evMeta}>
            {when}
            {e.location !== undefined ? ` · ${e.location}` : ''}
          </Text>
        </View>
      </Press>
    );
  };

  const dayHeader = (d0: number): React.JSX.Element => (
    <Text style={[s.dayH, d0 === today ? s.dayHToday : null]}>
      {d0 === today ? 'Heute · ' : ''}
      {longDay(d0)}
    </Text>
  );

  const selectedList = (): React.JSX.Element => {
    const evs = evOn(selected);
    return (
      <>
        {dayHeader(selected)}
        {evs.length > 0 ? (
          evs.map(eventChip)
        ) : (
          <Text style={s.empty}>Keine Termine an diesem Tag.</Text>
        )}
      </>
    );
  };

  const renderList = (): React.JSX.Element => {
    const days = [...new Set(filtered.map((e) => dStart(e.startAt)))].sort((a, b) => a - b);
    if (days.length === 0) return <Text style={s.empty}>Keine Termine gefunden.</Text>;
    return (
      <>
        {days.map((d0) => (
          <View key={d0}>
            {dayHeader(d0)}
            {evOn(d0).map(eventChip)}
          </View>
        ))}
      </>
    );
  };

  const renderDay = (): React.JSX.Element => {
    const startH = 7;
    const endH = 21;
    const hh = 52;
    const evs = evOn(selected);
    const hours: React.JSX.Element[] = [];
    for (let h = startH; h <= endH; h++) {
      hours.push(
        <View key={h} style={[s.hourRow, { height: hh }]}>
          <Text style={s.hourLbl}>{String(h).padStart(2, '0')}:00</Text>
        </View>,
      );
    }
    const allDay = evs.filter((e) => e.isAllDay);
    return (
      <>
        <View style={s.dayNav}>
          <IconButton
            name="chevronLeft"
            color={t.c.textPrimary}
            onPress={() => setSelected((d) => d - DAY)}
          />
          <Text style={s.dayNavTitle}>{longDay(selected)}</Text>
          <IconButton
            name="chevronRight"
            color={t.c.textPrimary}
            onPress={() => setSelected((d) => d + DAY)}
          />
        </View>
        {allDay.map((e) => (
          <View key={e.id} style={[s.allDay, { backgroundColor: evColor(e) }]}>
            <Text style={s.allDayText}>{e.subject}</Text>
          </View>
        ))}
        <View style={[s.timeline, { height: (endH - startH + 1) * hh }]}>
          {hours}
          <View style={s.blocks}>
            {evs
              .filter((e) => !e.isAllDay)
              .map((e) => {
                const sd = new Date(e.startAt);
                const top = (sd.getHours() + sd.getMinutes() / 60 - startH) * hh;
                const height = Math.max(26, ((e.endAt - e.startAt) / 3_600_000) * hh - 4);
                const cc = evColor(e);
                return (
                  <View
                    key={e.id}
                    style={[
                      s.block,
                      { top, height, backgroundColor: cc + '1F', borderLeftColor: cc },
                    ]}
                  >
                    <Text numberOfLines={1} style={[s.blockTitle, { color: cc }]}>
                      {e.subject}
                    </Text>
                    <Text numberOfLines={1} style={s.blockMeta}>
                      {hm(e.startAt)}–{hm(e.endAt)}
                      {e.location !== undefined ? ` · ${e.location}` : ''}
                    </Text>
                  </View>
                );
              })}
          </View>
        </View>
      </>
    );
  };

  const renderWeek = (): React.JSX.Element => {
    const mon = mondayOf(selected);
    const cells: React.JSX.Element[] = [];
    for (let i = 0; i < 7; i++) {
      const d0 = mon + i * DAY;
      const isToday = d0 === today;
      const isSel = d0 === selected;
      cells.push(
        <Pressable key={d0} style={s.wd} onPress={() => setSelected(d0)}>
          <Text style={s.wdn}>
            {new Date(d0).toLocaleDateString('de-DE', { weekday: 'short' })}
          </Text>
          <View style={[s.wdd, isToday ? s.wddToday : null, isSel && !isToday ? s.wddSel : null]}>
            <Text style={[s.wddText, isToday ? s.wddTextToday : null]}>
              {new Date(d0).getDate()}
            </Text>
          </View>
          <View style={s.dots}>
            {evOn(d0)
              .slice(0, 4)
              .map((e) => (
                <View key={e.id} style={[s.d, { backgroundColor: evColor(e) }]} />
              ))}
          </View>
        </Pressable>,
      );
    }
    return (
      <>
        <View style={s.weekStrip}>{cells}</View>
        {selectedList()}
      </>
    );
  };

  const renderMonth = (): React.JSX.Element => {
    const d = new Date(selected);
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const start = mondayOf(first.getTime());
    const monthName = first.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    const weekdayHead = ['M', 'D', 'M', 'D', 'F', 'S', 'S'];
    const weeks: React.JSX.Element[] = [];
    for (let w = 0; w < 6; w++) {
      const ws = start + w * 7 * DAY;
      const cells: React.JSX.Element[] = [];
      for (let i = 0; i < 7; i++) {
        const d0 = ws + i * DAY;
        const dt = new Date(d0);
        const inMonth = dt.getMonth() === d.getMonth();
        const isToday = d0 === today;
        const isSel = d0 === selected;
        const evs = evOn(d0);
        cells.push(
          <Pressable key={d0} style={s.mcell} onPress={() => setSelected(d0)}>
            <View
              style={[s.mnum, isToday ? s.mnumToday : null, isSel && !isToday ? s.mnumSel : null]}
            >
              <Text
                style={[s.mnumText, isToday ? s.mnumTextToday : null, !inMonth ? s.mnumDim : null]}
              >
                {dt.getDate()}
              </Text>
            </View>
            {evs.slice(0, 2).map((e) => (
              <View key={e.id} style={[s.chip, { backgroundColor: evColor(e) + '26' }]}>
                <View style={[s.cdot, { backgroundColor: evColor(e) }]} />
                <Text numberOfLines={1} style={s.chipText}>
                  {e.subject}
                </Text>
              </View>
            ))}
            {evs.length > 2 ? <Text style={s.cmore}>+{evs.length - 2}</Text> : null}
          </Pressable>,
        );
      }
      weeks.push(
        <View key={ws} style={s.mweek}>
          <Text style={s.wnum}>{isoWeek(ws)}</Text>
          <View style={s.mrow}>{cells}</View>
        </View>,
      );
    }
    return (
      <>
        <View style={s.dayNav}>
          <IconButton
            name="chevronLeft"
            color={t.c.textPrimary}
            onPress={() => {
              const n = new Date(selected);
              n.setMonth(n.getMonth() - 1);
              setSelected(dStart(n.getTime()));
            }}
          />
          <Text style={s.dayNavTitle}>{monthName}</Text>
          <IconButton
            name="chevronRight"
            color={t.c.textPrimary}
            onPress={() => {
              const n = new Date(selected);
              n.setMonth(n.getMonth() + 1);
              setSelected(dStart(n.getTime()));
            }}
          />
        </View>
        <View style={s.mhead}>
          <Text style={s.wnum} />
          <View style={s.mrow}>
            {weekdayHead.map((x, i) => (
              <Text key={i} style={[s.mh, i >= 5 ? s.mhWe : null]}>
                {x}
              </Text>
            ))}
          </View>
        </View>
        <View style={s.mcal}>{weeks}</View>
        {selectedList()}
      </>
    );
  };

  const body =
    view === 'day'
      ? renderDay()
      : view === 'week'
        ? renderWeek()
        : view === 'month'
          ? renderMonth()
          : renderList();

  if (route.name === 'detail') {
    return (
      <EventDetailScreen
        event={route.event}
        canEdit={canEdit}
        onBack={() => setRoute({ name: 'calendar' })}
        onEdit={() => setRoute({ name: 'edit', event: route.event })}
        onDelete={() => onDeleteEvent(route.event)}
        onRespond={(r) => onRespondEvent(route.event, r)}
      />
    );
  }

  if (route.name === 'edit') {
    return (
      <EventEditScreen
        account={account}
        accountEmail={accountEmail}
        {...(route.event !== undefined ? { event: route.event } : {})}
        {...(route.day !== undefined ? { initialDay: route.day } : {})}
        onCancel={() =>
          setRoute(
            route.event !== undefined
              ? { name: 'detail', event: route.event }
              : { name: 'calendar' },
          )
        }
        onSave={onSaveEvent}
      />
    );
  }

  return (
    <View style={s.screen}>
      <ScreenHeader
        title="Kalender"
        right={
          <View style={s.headerRight}>
            {loadCalendar !== undefined && shared.length > 0 ? (
              <IconButton
                name="folder"
                color={sources.length > 0 ? t.c.brandPrimary : t.c.textSecondary}
                onPress={() => setSourcesOpen(true)}
                size={22}
              />
            ) : null}
            <Pressable hitSlop={6} onPress={() => setSelected(today)}>
              <Text style={s.todayBtn}>Heute</Text>
            </Pressable>
          </View>
        }
        search={{ value: query, onChange: setQuery, placeholder: 'Termine durchsuchen' }}
      >
        <View style={s.segWrap}>
          <Segmented options={VIEWS} value={view} onChange={setView} />
        </View>
      </ScreenHeader>
      <ScrollView
        contentContainerStyle={s.content}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {body}
      </ScrollView>
      {canEdit ? (
        <FAB icon="plus" onPress={() => setRoute({ name: 'edit', day: selected })} />
      ) : null}

      <BottomSheet
        visible={sourcesOpen}
        onClose={() => setSourcesOpen(false)}
        title="Kalender anzeigen"
      >
        <View style={s.srcRow}>
          <Icon name="calendar" size={20} color={t.c.brandPrimary} />
          <Text style={s.srcLabel}>Mein Kalender</Text>
          <Switch value disabled trackColor={{ true: t.c.brandPrimary, false: t.border }} />
        </View>
        {shared.map((mb) => (
          <View key={mb.email} style={s.srcRow}>
            <Icon name="calendar" size={20} color={t.c.textSecondary} />
            <View style={s.srcBody}>
              <Text style={s.srcLabel} numberOfLines={1}>
                {mb.displayName}
              </Text>
              <Text style={s.srcSub} numberOfLines={1}>
                {mb.email}
              </Text>
            </View>
            <Switch
              value={sources.includes(mb.email)}
              onValueChange={() => toggleSource(mb.email)}
              trackColor={{ true: t.c.brandPrimary, false: t.border }}
            />
          </View>
        ))}
      </BottomSheet>
    </View>
  );
}

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    allDay: {
      borderRadius: 6,
      marginHorizontal: space.md,
      marginBottom: 4,
      paddingHorizontal: space.sm,
      paddingVertical: 5,
    },
    allDayText: { color: t.onBrand, fontSize: typography.caption.size, fontWeight: '600' },
    headerRight: { alignItems: 'center', flexDirection: 'row', gap: space.xs },
    srcBody: { flex: 1, minWidth: 0 },
    srcLabel: { color: t.c.textPrimary, flex: 1, fontSize: typography.body.size },
    srcRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: space.sm,
      paddingVertical: space.sm,
    },
    srcSub: { color: t.c.textSecondary, fontSize: typography.caption.size },
    block: {
      borderLeftWidth: 3,
      borderRadius: 6,
      left: 0,
      overflow: 'hidden',
      paddingHorizontal: space.xs,
      paddingVertical: 4,
      position: 'absolute',
      right: 4,
    },
    blockMeta: { color: t.c.textSecondary, fontSize: 11 },
    blockTitle: { fontSize: typography.caption.size, fontWeight: '700' },
    blocks: { bottom: 0, left: 52, position: 'absolute', right: 0, top: 0 },
    cdot: { borderRadius: 3, height: 6, width: 6 },
    chip: {
      alignItems: 'center',
      borderRadius: 5,
      flexDirection: 'row',
      gap: 3,
      marginBottom: 2,
      marginHorizontal: 1,
      paddingHorizontal: 3,
      paddingVertical: 1,
    },
    chipText: { color: t.c.textPrimary, fontSize: 9.5 },
    cmore: { color: t.c.textSecondary, fontSize: 9, paddingLeft: 5 },
    content: { paddingBottom: 118 },
    d: { borderRadius: 3, height: 5, width: 5 },
    dayH: {
      color: t.c.textSecondary,
      fontSize: typography.caption.size,
      fontWeight: '700',
      letterSpacing: 0.3,
      paddingBottom: space.xxs,
      paddingHorizontal: space.md,
      paddingTop: space.md,
      textTransform: 'uppercase',
    },
    dayHToday: { color: t.c.brandPrimary },
    dayNav: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: space.xs,
      paddingHorizontal: space.sm,
      paddingVertical: space.xs,
    },
    dayNavTitle: { color: t.c.textPrimary, flex: 1, fontWeight: '700', textAlign: 'center' },
    dots: { flexDirection: 'row', gap: 3, justifyContent: 'center', marginTop: 3, minHeight: 6 },
    edot: { borderRadius: 5, height: 10, width: 10 },
    empty: {
      color: t.c.textSecondary,
      fontSize: typography.body.size,
      padding: space.lg,
      textAlign: 'center',
    },
    evBody: { flex: 1, minWidth: 0 },
    evMeta: { color: t.c.textSecondary, fontSize: typography.caption.size },
    evTitle: { color: t.c.textPrimary, fontSize: typography.body.size, fontWeight: '700' },
    evc: {
      alignItems: 'center',
      borderRadius: 12,
      flexDirection: 'row',
      gap: 10,
      marginHorizontal: space.md,
      marginVertical: 4,
      paddingHorizontal: space.sm,
      paddingVertical: 10,
    },
    hourLbl: {
      backgroundColor: t.c.bgCanvas,
      color: t.c.textSecondary,
      fontSize: 11,
      left: 0,
      paddingRight: 6,
      position: 'absolute',
      top: -8,
    },
    hourRow: {
      borderTopColor: t.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      position: 'relative',
    },
    mcal: { paddingBottom: space.sm, paddingHorizontal: space.md },
    mcell: {
      borderRadius: 10,
      flex: 1,
      minHeight: 76,
      overflow: 'hidden',
      paddingHorizontal: 1,
      paddingTop: 3,
    },
    mh: { color: t.c.textSecondary, flex: 1, fontSize: 11, textAlign: 'center' },
    mhWe: { opacity: 0.55 },
    mhead: {
      alignItems: 'center',
      flexDirection: 'row',
      paddingHorizontal: space.md,
      paddingVertical: 2,
    },
    mnum: {
      alignSelf: 'center',
      alignItems: 'center',
      borderRadius: 13,
      height: 26,
      justifyContent: 'center',
      marginBottom: 3,
      width: 26,
    },
    mnumDim: { opacity: 0.38 },
    mnumSel: { backgroundColor: t.c.bgElevated },
    mnumText: { color: t.c.textPrimary, fontSize: typography.caption.size },
    mnumTextToday: { color: t.onBrand, fontWeight: '700' },
    mnumToday: { backgroundColor: t.c.brandPrimary },
    mrow: { flex: 1, flexDirection: 'row', gap: 2 },
    mweek: { alignItems: 'flex-start', flexDirection: 'row' },
    screen: { backgroundColor: t.c.bgCanvas, flex: 1 },
    segWrap: { marginBottom: space.xs, marginHorizontal: space.md },
    timeline: { marginBottom: space.lg, marginHorizontal: space.md, position: 'relative' },
    todayBtn: {
      color: t.c.brandPrimary,
      fontSize: typography.body.size,
      fontWeight: '600',
      paddingHorizontal: space.xs,
    },
    wd: { flex: 1, paddingBottom: 8, paddingTop: 6 },
    wdd: {
      alignItems: 'center',
      alignSelf: 'center',
      borderRadius: 16,
      height: 32,
      justifyContent: 'center',
      marginTop: 2,
      width: 32,
    },
    // Ausgewählter Tag als gefüllte Fläche (KEIN Rahmen auf gerundeter View → iOS-26-Crash-Schutz).
    wddSel: { backgroundColor: t.mode === 'dark' ? '#1B2740' : '#EAF0FE' },
    wddText: { color: t.c.textPrimary, fontWeight: '700' },
    wddTextToday: { color: t.onBrand },
    wddToday: { backgroundColor: t.c.brandPrimary },
    wdn: { color: t.c.textSecondary, fontSize: 11, textAlign: 'center' },
    weekStrip: { flexDirection: 'row', marginBottom: space.xs },
    wnum: { color: t.c.textSecondary, fontSize: 10, paddingTop: 8, textAlign: 'center', width: 18 },
  });
}
