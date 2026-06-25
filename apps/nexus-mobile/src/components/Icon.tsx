import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * Dependency-freie Linien-Icons (ohne `react-native-svg`, damit der native Build schlank
 * bleibt). Die vier Tab-Symbole sind aus RN-Views komponiert und erben die Farbe — so bleiben
 * sie monochrom und passen sich Hell/Dunkel an.
 */
export type IconName = 'mail' | 'calendar' | 'contacts' | 'more';

interface IconProps {
  readonly name: IconName;
  readonly size?: number;
  readonly color: string;
}

export function Icon({ name, size = 24, color }: IconProps): React.JSX.Element {
  switch (name) {
    case 'mail':
      return <MailIcon size={size} color={color} />;
    case 'calendar':
      return <CalendarIcon size={size} color={color} />;
    case 'contacts':
      return <ContactsIcon size={size} color={color} />;
    case 'more':
      return <MoreIcon size={size} color={color} />;
  }
}

function MailIcon({ size, color }: { readonly size: number; readonly color: string }) {
  const w = size * 0.92;
  const h = size * 0.66;
  const fw = w / 2 - 2;
  const fh = h * 0.52;
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <View style={{ width: w, height: h, borderWidth: 2, borderColor: color, borderRadius: 3 }}>
        <View
          style={{
            position: 'absolute',
            top: -2,
            left: 0,
            width: 0,
            height: 0,
            borderLeftWidth: fw,
            borderRightWidth: fw,
            borderTopWidth: fh,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderTopColor: color,
          }}
        />
      </View>
    </View>
  );
}

function CalendarIcon({ size, color }: { readonly size: number; readonly color: string }) {
  const w = size * 0.82;
  const h = size * 0.78;
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <View
        style={{
          width: 2,
          height: size * 0.16,
          backgroundColor: color,
          position: 'absolute',
          top: size * 0.04,
          left: size * 0.32,
        }}
      />
      <View
        style={{
          width: 2,
          height: size * 0.16,
          backgroundColor: color,
          position: 'absolute',
          top: size * 0.04,
          left: size * 0.66,
        }}
      />
      <View
        style={{
          width: w,
          height: h,
          borderWidth: 2,
          borderColor: color,
          borderRadius: 4,
          marginTop: size * 0.12,
        }}
      >
        <View
          style={{
            position: 'absolute',
            top: size * 0.18,
            left: -2,
            right: -2,
            height: 2,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  );
}

function ContactsIcon({ size, color }: { readonly size: number; readonly color: string }) {
  const head = size * 0.4;
  const body = size * 0.66;
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <View
        style={{
          width: head,
          height: head,
          borderRadius: head / 2,
          borderWidth: 2,
          borderColor: color,
          marginBottom: size * 0.06,
        }}
      />
      <View
        style={{
          width: body,
          height: body * 0.5,
          borderWidth: 2,
          borderBottomWidth: 0,
          borderColor: color,
          borderTopLeftRadius: body,
          borderTopRightRadius: body,
        }}
      />
    </View>
  );
}

function MoreIcon({ size, color }: { readonly size: number; readonly color: string }) {
  const d = Math.max(4, size * 0.2);
  const dot = {
    width: d,
    height: d,
    borderRadius: d / 2,
    backgroundColor: color,
    marginHorizontal: d * 0.35,
  };
  return (
    <View style={[styles.box, styles.row, { width: size, height: size }]}>
      <View style={dot} />
      <View style={dot} />
      <View style={dot} />
    </View>
  );
}

/** Runder, gedrückt animierter Symbol-Button (Header-Aktionen wie Menü/Verfassen). */
export function IconButton({
  glyph,
  color,
  onPress,
  size = 23,
}: {
  readonly glyph: string;
  readonly color: string;
  readonly onPress: () => void;
  readonly size?: number;
}): React.JSX.Element {
  return (
    <Pressable
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.iconBtn, pressed ? styles.iconBtnPressed : null]}
    >
      <View>
        <GlyphText glyph={glyph} color={color} size={size} />
      </View>
    </Pressable>
  );
}

// Zuverlässig monochrome Text-Glyphen (kein Emoji-Fallback) für sekundäre Symbole.
function GlyphText({
  glyph,
  color,
  size,
}: {
  readonly glyph: string;
  readonly color: string;
  readonly size: number;
}) {
  return <Text style={{ color, fontSize: size, lineHeight: size + 2 }}>{glyph}</Text>;
}

export const GLYPH = {
  menu: '☰',
  compose: '✎',
  chevL: '‹',
  chevR: '›',
  plus: '＋',
  check: '✓',
  chevronRight: '›',
} as const;

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  iconBtn: {
    alignItems: 'center',
    borderRadius: 999,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  iconBtnPressed: { opacity: 0.5 },
  row: { flexDirection: 'row' },
});
