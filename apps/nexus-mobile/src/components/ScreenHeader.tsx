import React, { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { radius, space, typography } from '@nexus/ui-kit';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface SearchProps {
  readonly value: string;
  readonly onChange: (text: string) => void;
  readonly placeholder: string;
}

interface Props {
  readonly title: string;
  readonly subtitle?: string;
  /** Linke Aktion (i. d. R. das Menü-/Ordner-Symbol). */
  readonly left?: ReactNode;
  /** Rechte Aktion(en) (z. B. Verfassen, Heute, Neuer Termin). */
  readonly right?: ReactNode;
  /** Optionales, immer sichtbares Suchfeld unter der Titelzeile. */
  readonly search?: SearchProps;
  /** Optionaler Inhalt zwischen Titelzeile und Suche (z. B. Segment-Steuerung). */
  readonly children?: ReactNode;
}

/** Sticky-Kopfzeile im Vorschau-Stil: Titel, optionale Symbol-Aktionen und Inline-Suche. */
export function ScreenHeader({
  title,
  subtitle,
  left,
  right,
  search,
  children,
}: Props): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={s.header}>
      <View style={s.appbar}>
        {left ?? <View style={s.slot} />}
        <Text style={s.title} numberOfLines={1}>
          {title}
        </Text>
        {right ?? <View style={s.slot} />}
      </View>
      {subtitle !== undefined ? <Text style={s.subtitle}>{subtitle}</Text> : null}
      {children}
      {search !== undefined ? (
        <View style={s.searchWrap}>
          <TextInput
            style={s.search}
            placeholder={search.placeholder}
            placeholderTextColor={t.c.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            value={search.value}
            onChangeText={search.onChange}
          />
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    appbar: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: space.xs,
      paddingHorizontal: space.md,
      paddingTop: space.sm,
      paddingBottom: space.xs,
    },
    header: {
      backgroundColor: t.c.bgCanvas,
    },
    search: {
      // Flach/modern: keine gefüllte Fläche, nur eine dezente Schattierung.
      backgroundColor: t.c.textSecondary + '1A',
      borderRadius: radius.pill,
      color: t.c.textPrimary,
      fontSize: typography.body.size,
      paddingHorizontal: space.md,
      paddingVertical: 11,
    },
    searchWrap: { paddingBottom: space.sm, paddingHorizontal: space.md },
    slot: { height: 40, width: 40 },
    subtitle: {
      color: t.c.textSecondary,
      fontSize: typography.caption.size,
      paddingBottom: space.xs,
      paddingHorizontal: space.md,
    },
    title: {
      color: t.c.textPrimary,
      flex: 1,
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: 0.2,
      paddingHorizontal: space.xxs,
    },
  });
}
