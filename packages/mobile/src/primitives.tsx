/**
 * The handful of building blocks every sheet is made of. Same roles and sizes
 * as the web's .go-* classes: 56px fields and buttons, 36px chips, rows with an
 * icon tile on the left and a chevron on the right.
 */
import { HALL } from '@bazar/storefront';
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
import { FACE, color, font, noOutline, press, radius, scale, shadow } from './theme';

type TextRole = 'display' | 'title' | 'section' | 'body' | 'muted' | 'caption' | 'price';

const TEXT: Record<TextRole, TextStyle> = {
  display: { fontFamily: font.heading, ...scale.headline, letterSpacing: -0.3, color: color.ink },
  title: { fontFamily: font.heading, ...scale.title, color: color.ink },
  section: { fontFamily: font.heading, ...scale.title, color: color.ink },
  body: { fontFamily: font.body, ...scale.lead, color: color.ink },
  muted: { fontFamily: font.body, ...scale.body, color: color.inkMuted },
  caption: { fontFamily: font.body, ...scale.caption, color: color.inkMuted },
  price: {
    fontFamily: font.display,
    ...scale.lead,
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
  // Primary is the pomegranate pill; danger the same pill pressed deeper; secondary a paper slip.
  // Buttons lie on paper, so they lie flat — the one shadow is for what lifts off the ground.
  // Not yet: a solid worn-paper pill, never a see-through one over the content behind it.
  const bg = disabled
    ? color.lineStrong
    : variant === 'primary'
      ? color.brand500
      : variant === 'danger'
        ? color.brand600
        : color.tile;
  const fg = disabled ? color.inkMuted : variant === 'secondary' ? color.ink : color.white;
  return (
    <Pressable
      disabled={disabled}
      style={({ pressed }) => [
        s.button,
        press.base,
        variant === 'secondary' && s.buttonPaper,
        { backgroundColor: bg, opacity: pressed ? 0.9 : 1 },
        pressed && press.down,
        style,
      ]}
      {...rest}
    >
      {/* A reason on a dead button can take two lines; the pill grows instead of spilling. */}
      <RNText style={[s.buttonLabel, s.buttonText, { color: fg }]} numberOfLines={2}>
        {label}
      </RNText>
      {trailing ? <RNText style={[s.buttonLabel, { color: fg }]}>{trailing}</RNText> : null}
    </Pressable>
  );
}

export function Chip({
  leading,
  label,
  active,
  onPress,
}: {
  leading?: ReactNode;
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [s.chip, press.base, active && s.chipActive, pressed && press.down]}
    >
      {leading}
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
        {/* Two lines, then three: a cut row hid the order's total and the support hours. */}
        <Text
          role={eyebrow ? 'body' : 'title'}
          numberOfLines={2}
          style={eyebrow ? { fontWeight: '500' } : undefined}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text role="muted" numberOfLines={3}>
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
    minHeight: 56,
    paddingVertical: 8,
    borderRadius: radius.pill,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonLabel: { fontFamily: font.heading, ...scale.lead, letterSpacing: 0 },
  buttonText: { flexShrink: 1 },
  buttonPaper: { borderWidth: 1, borderColor: color.lineStrong },
  // A chip is a small paper pill with a kraft edge; the chosen one is stamped pomegranate.
  chip: {
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: color.tile,
    borderWidth: 1,
    borderColor: color.lineStrong,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipActive: { backgroundColor: color.brand500, borderColor: color.brand500 },
  chipLabel: { fontFamily: font.bodySemi, fontSize: scale.body.fontSize, color: color.ink },
  field: {
    height: 56,
    borderRadius: radius.paper,
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
    fontSize: scale.lead.fontSize,
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
    borderRadius: radius.paper,
  },
  rowTile: {
    width: 44,
    height: 44,
    borderRadius: radius.paper,
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
    ...shadow.paper,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    // Counters are ochre light, like every badge in the apps; pomegranate is only a button.
    backgroundColor: color.saffron500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: HALL.ink,
    fontSize: scale.caption.fontSize,
    fontFamily: font.display,
    fontVariant: ['tabular-nums'],
  },
  // A slip of paper with a plain edge — the torn edge belongs to receipts alone.
  panel: {
    backgroundColor: color.tile,
    borderRadius: radius.paper,
    borderWidth: 1,
    borderColor: color.line,
    padding: 16,
  },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
});
