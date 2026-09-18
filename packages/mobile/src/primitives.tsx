/**
 * The handful of building blocks every sheet is made of. Same roles and sizes
 * as the web's .go-* classes: 56px fields and buttons, 36px chips, rows with an
 * icon tile on the left and a chevron on the right.
 */
import { forwardRef, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { Chevron } from './Icons';
import { FACE, color, font, noOutline, press, radius, shadow } from './theme';

type TextRole = 'display' | 'title' | 'section' | 'body' | 'muted' | 'caption' | 'price';

const TEXT: Record<TextRole, TextStyle> = {
  display: {
    fontFamily: font.heading,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.3,
    color: color.ink,
  },
  title: {
    fontFamily: font.heading,
    fontSize: 19,
    lineHeight: 23,
    letterSpacing: 0,
    color: color.ink,
  },
  section: {
    fontFamily: font.heading,
    fontSize: 21,
    lineHeight: 25,
    letterSpacing: 0,
    color: color.ink,
  },
  body: { fontFamily: font.body, fontSize: 16, lineHeight: 22, color: color.ink },
  muted: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: color.inkMuted },
  caption: { fontFamily: font.body, fontSize: 12, lineHeight: 16, color: color.inkMuted },
  price: {
    fontFamily: font.display,
    fontSize: 16,
    lineHeight: 22,
    color: color.ink,
    fontVariant: ['tabular-nums'],
  },
};

export function Text({
  role = 'body',
  style,
  children,
  numberOfLines,
  onPress,
}: {
  role?: TextRole;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
  /** Inline links ("Другой номер"); buttons stay buttons. */
  onPress?: (() => void) | undefined;
}) {
  // Custom fonts do not synthesise bold: a fontWeight in the style becomes the matching face.
  const { fontWeight, ...flat } = StyleSheet.flatten([TEXT[role], style]) as TextStyle;
  const face = fontWeight !== undefined ? FACE[String(fontWeight)] : undefined;
  return (
    <RNText
      style={[flat, face ? { fontFamily: face } : null]}
      numberOfLines={numberOfLines}
      onPress={onPress}
    >
      {children}
    </RNText>
  );
}

export function Button({
  label,
  trailing,
  variant = 'primary',
  disabled,
  style,
  ...rest
}: PressableProps & {
  label: string;
  trailing?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  style?: StyleProp<ViewStyle>;
}) {
  // Primary is the pomegranate stamp; secondary is a paper slip with a kraft edge.
  const bg =
    variant === 'primary' ? color.brand500 : variant === 'danger' ? color.danger : color.tile;
  const fg = variant === 'secondary' ? color.ink : color.white;
  return (
    <Pressable
      disabled={disabled}
      style={({ pressed }) => [
        s.button,
        press.base,
        variant === 'primary' && shadow.glow,
        variant === 'secondary' && s.buttonPaper,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.9 : 1 },
        pressed && press.down,
        style,
      ]}
      {...rest}
    >
      <RNText style={[s.buttonLabel, { color: fg }]}>{label}</RNText>
      {trailing ? <RNText style={[s.buttonLabel, { color: fg }]}>{trailing}</RNText> : null}
    </Pressable>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.chip, press.base, active && s.chipActive, pressed && press.down]}
    >
      <RNText style={[s.chipLabel, active && { color: color.white }]}>{label}</RNText>
    </Pressable>
  );
}

export const Field = forwardRef<
  TextInput,
  Omit<TextInputProps, 'style'> & { style?: StyleProp<ViewStyle>; leading?: ReactNode }
>(function Field({ style, leading, ...rest }, ref) {
  return (
    <View style={[s.field, style]}>
      {leading}
      <TextInput ref={ref} placeholderTextColor={color.inkFaint} style={s.fieldInput} {...rest} />
    </View>
  );
});

/** Icon tile + two lines + chevron. `tone` colours the tile. */
export function Row({
  icon,
  tone = 'sand',
  eyebrow,
  title,
  subtitle,
  trailing,
  chevron = true,
  bare = false,
  onPress,
}: {
  icon: ReactNode;
  tone?: 'sand' | 'saffron' | 'brand';
  eyebrow?: string;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  chevron?: boolean;
  /** The icon is its own framed thing (a photo): skip the tinted tile. */
  bare?: boolean;
  onPress?: () => void;
}) {
  const tile =
    tone === 'saffron' ? color.saffron100 : tone === 'brand' ? color.brand50 : color.sand100;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [s.row, pressed && { backgroundColor: color.sand50 }]}
    >
      {bare ? icon : <View style={[s.rowTile, { backgroundColor: tile }]}>{icon}</View>}
      <View style={{ flex: 1, minWidth: 0 }}>
        {eyebrow ? <Text role="caption">{eyebrow}</Text> : null}
        <Text
          role={eyebrow ? 'body' : 'title'}
          numberOfLines={1}
          style={eyebrow ? { fontWeight: '500' } : undefined}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text role="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {chevron && onPress ? <Chevron size={20} color={color.inkFaint} /> : null}
    </Pressable>
  );
}

export function Fab({
  children,
  onPress,
  badge,
}: {
  children: ReactNode;
  onPress?: () => void;
  badge?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.fab, pressed && { backgroundColor: color.sand50 }]}
    >
      {children}
      {badge ? (
        <View style={s.badge}>
          <RNText style={s.badgeText}>{badge}</RNText>
        </View>
      ) : null}
    </Pressable>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.panel, style]}>{children}</View>;
}

export function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={s.line}>
      <Text role={strong ? 'price' : 'muted'}>{label}</Text>
      <Text role={strong ? 'price' : 'muted'} style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  button: {
    height: 56,
    borderRadius: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonLabel: { fontFamily: font.heading, fontSize: 18, letterSpacing: 0 },
  buttonPaper: { borderWidth: 1, borderColor: color.lineStrong },
  // A chip is a small paper sign: square-ish corners, a kraft edge; the chosen one is stamped.
  chip: {
    height: 38,
    borderRadius: 10,
    backgroundColor: color.tile,
    borderWidth: 1,
    borderColor: color.lineStrong,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipActive: { backgroundColor: color.brand500, borderColor: color.brand500 },
  chipLabel: { fontFamily: font.bodySemi, fontSize: 14, color: color.ink },
  field: {
    height: 56,
    borderRadius: 14,
    backgroundColor: color.field,
    borderWidth: 1,
    borderColor: color.line,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fieldInput: {
    flex: 1,
    fontFamily: font.body,
    fontSize: 16,
    color: color.ink,
    paddingVertical: 0,
    ...noOutline,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginHorizontal: -12,
    borderRadius: radius.panel,
  },
  rowTile: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.raise,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.pop,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: color.brand500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: color.white, fontSize: 11, fontFamily: font.bodySemi },
  // A slip of paper: cream, a dashed edge — the same slip the receipts use.
  panel: {
    backgroundColor: '#FBF5E6',
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#C9B99A',
    padding: 16,
  },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
});
