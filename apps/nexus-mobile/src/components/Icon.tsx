import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Svg, { Circle, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';

/**
 * Modernes Linien-Icon-Set (react-native-svg), Feather/Lucide-Stil: 24er-Raster, runde Enden,
 * eine Strichstärke. Ein einziges `<Icon name … />` ersetzt die früheren View-Icons und die
 * Unicode-Glyphen. Farbe/Größe/Strichstärke per Prop.
 */
export type IconName =
  | 'mail'
  | 'calendar'
  | 'contacts'
  | 'more'
  | 'menu'
  | 'edit'
  | 'search'
  | 'plus'
  | 'check'
  | 'x'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronDown'
  | 'star'
  | 'reply'
  | 'replyAll'
  | 'forward'
  | 'archive'
  | 'trash'
  | 'folder'
  | 'inbox'
  | 'send'
  | 'paperclip'
  | 'flag'
  | 'shield'
  | 'refresh'
  | 'settings'
  | 'lock'
  | 'clock'
  | 'user'
  | 'image'
  | 'dot';

interface IconProps {
  readonly name: IconName;
  readonly size?: number;
  readonly color: string;
  readonly strokeWidth?: number;
}

/** Zeichnet die Icon-Geometrie (erbt stroke/fill vom umgebenden <Svg>). */
function shape(name: IconName): React.JSX.Element {
  switch (name) {
    case 'mail':
      return (
        <>
          <Rect x={3} y={5} width={18} height={14} rx={2.5} />
          <Path d="M3.5 7.5 12 13l8.5-5.5" />
        </>
      );
    case 'calendar':
      return (
        <>
          <Rect x={3} y={4.5} width={18} height={16} rx={3} />
          <Line x1={3} y1={9} x2={21} y2={9} />
          <Line x1={8} y1={2.5} x2={8} y2={6} />
          <Line x1={16} y1={2.5} x2={16} y2={6} />
        </>
      );
    case 'contacts':
    case 'user':
      return (
        <>
          <Circle cx={12} cy={8} r={3.5} />
          <Path d="M5.5 20c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5" />
        </>
      );
    case 'more':
      return (
        <>
          <Circle cx={5} cy={12} r={1.4} />
          <Circle cx={12} cy={12} r={1.4} />
          <Circle cx={19} cy={12} r={1.4} />
        </>
      );
    case 'menu':
      return (
        <>
          <Line x1={3.5} y1={6} x2={20.5} y2={6} />
          <Line x1={3.5} y1={12} x2={20.5} y2={12} />
          <Line x1={3.5} y1={18} x2={20.5} y2={18} />
        </>
      );
    case 'edit':
      return (
        <>
          <Path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
          <Line x1={14.5} y1={7.5} x2={17.5} y2={10.5} />
        </>
      );
    case 'search':
      return (
        <>
          <Circle cx={11} cy={11} r={7} />
          <Line x1={20.5} y1={20.5} x2={16} y2={16} />
        </>
      );
    case 'plus':
      return (
        <>
          <Line x1={12} y1={5} x2={12} y2={19} />
          <Line x1={5} y1={12} x2={19} y2={12} />
        </>
      );
    case 'check':
      return <Polyline points="20 6 9 17 4 12" />;
    case 'x':
      return (
        <>
          <Line x1={18} y1={6} x2={6} y2={18} />
          <Line x1={6} y1={6} x2={18} y2={18} />
        </>
      );
    case 'chevronLeft':
      return <Polyline points="15 6 9 12 15 18" />;
    case 'chevronRight':
      return <Polyline points="9 6 15 12 9 18" />;
    case 'chevronDown':
      return <Polyline points="6 9 12 15 18 9" />;
    case 'star':
      return (
        <Polygon points="12 3 14.7 8.5 20.8 9.4 16.4 13.7 17.4 19.8 12 16.9 6.6 19.8 7.6 13.7 3.2 9.4 9.3 8.5" />
      );
    case 'reply':
      return (
        <>
          <Polyline points="9 7 4 12 9 17" />
          <Path d="M4 12h11a4 4 0 0 1 4 4v2" />
        </>
      );
    case 'replyAll':
      return (
        <>
          <Polyline points="7 7 2 12 7 17" />
          <Polyline points="12 7 7 12 12 17" />
          <Path d="M7 12h9a4 4 0 0 1 4 4v2" />
        </>
      );
    case 'forward':
      return (
        <>
          <Polyline points="15 7 20 12 15 17" />
          <Path d="M20 12H9a4 4 0 0 0-4 4v2" />
        </>
      );
    case 'archive':
      return (
        <>
          <Rect x={3} y={4} width={18} height={4} rx={1.5} />
          <Path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
          <Line x1={10} y1={12} x2={14} y2={12} />
        </>
      );
    case 'trash':
      return (
        <>
          <Polyline points="4 6 20 6" />
          <Path d="M6 6v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6" />
          <Path d="M9.5 6V4.5a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5V6" />
        </>
      );
    case 'folder':
      return (
        <Path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      );
    case 'inbox':
      return (
        <>
          <Path d="M4 13h4l2 3h4l2-3h4" />
          <Path d="M5.5 5.5 4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5l-1.5-7.5A2 2 0 0 0 16.6 4H7.4a2 2 0 0 0-1.9 1.5z" />
        </>
      );
    case 'send':
      return (
        <>
          <Line x1={21} y1={3} x2={10.5} y2={13.5} />
          <Polygon points="21 3 14.5 21 10.5 13.5 3 9.5" />
        </>
      );
    case 'paperclip':
      return (
        <Path d="M21 11.5l-8.8 8.8a5 5 0 0 1-7-7l8.8-8.8a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.6 1.6 0 0 1-2.2-2.2l8-8" />
      );
    case 'flag':
      return (
        <>
          <Path d="M5 14s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <Line x1={5} y1={21} x2={5} y2={14} />
        </>
      );
    case 'shield':
      return <Path d="M12 21s7-3.5 7-9V5.5L12 3 5 5.5V12c0 5.5 7 9 7 9z" />;
    case 'refresh':
      return (
        <>
          <Path d="M20 11a8 8 0 1 0-1.8 6" />
          <Polyline points="20 4 20 11 13 11" />
        </>
      );
    case 'settings':
      return (
        <>
          <Line x1={4} y1={7} x2={20} y2={7} />
          <Circle cx={9} cy={7} r={2.2} />
          <Line x1={4} y1={14} x2={20} y2={14} />
          <Circle cx={15} cy={14} r={2.2} />
        </>
      );
    case 'lock':
      return (
        <>
          <Rect x={5} y={11} width={14} height={9.5} rx={2.5} />
          <Path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
        </>
      );
    case 'clock':
      return (
        <>
          <Circle cx={12} cy={12} r={8.5} />
          <Polyline points="12 7 12 12 15.5 14" />
        </>
      );
    case 'image':
      return (
        <>
          <Rect x={3} y={4.5} width={18} height={15} rx={2.5} />
          <Circle cx={8.5} cy={9.5} r={1.6} />
          <Path d="M4 17l4.5-4.5 3.5 3.5 3-3 5 5" />
        </>
      );
    case 'dot':
      return <Circle cx={12} cy={12} r={5} />;
  }
}

export function Icon({ name, size = 24, color, strokeWidth = 1.85 }: IconProps): React.JSX.Element {
  // `dot` ist gefüllt; alle anderen sind Strich-Icons.
  const filled = name === 'dot';
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? color : 'none'}
      stroke={filled ? 'none' : color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shape(name)}
    </Svg>
  );
}

interface IconButtonProps {
  readonly name: IconName;
  readonly color: string;
  readonly onPress: () => void;
  readonly size?: number;
}

/** Tippbares Icon mit großzügiger Trefferfläche und dezentem Press-Feedback. */
export function IconButton({
  name,
  color,
  onPress,
  size = 24,
}: IconButtonProps): React.JSX.Element {
  const t = useTheme();
  return (
    <Pressable
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.iconBtn, pressed ? { backgroundColor: t.rowActive } : null]}
    >
      <Icon name={name} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    alignItems: 'center',
    borderRadius: 999,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
});
