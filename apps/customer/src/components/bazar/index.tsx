/**
 * The bazaar scene language: the hall under the screen (a photograph only where
 * the scene is a photograph — the door, a counter, a dish), everything else on
 * it — a serif greeting, a vendor's own words in italic, cardboard price signs
 * with a pushpin, kraft tags and labels. No frames, no tab bar: the row is the
 * navigation. Colours are «Свет купола» (@bazar/storefront) and do not follow
 * the app theme — a scene is the same in the dark.
 */
import { GROUND, HALL, TONE, alpha, hallLight } from '@bazar/storefront';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, type ImageSource } from 'expo-image';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DomeGround, PhotoGrade, press, radius, scale, shadow, useLocale } from '@bazar/mobile';

export { isEvening, tashkentHour } from '@bazar/storefront';

/** The scene's colours: the six and their tones — never a literal of the scene's own. */
export const scene = {
  /** Text and discs on the ground. */
  cream: TONE.creamLight,
  /** The second line on the ground. */
  creamMuted: TONE.creamMuted,
  ink: HALL.ink,
  inkSoft: TONE.inkSoft,
  pomegranate: HALL.pomegranate,
  ochre: HALL.ochre,
  /** Ochre as text on the ground. */
  ochreLight: TONE.ochreLight,
  /** The board over a shop's door: painted lapis, never the ink of the paper. */
  board: TONE.board,
  paper: HALL.cream,
  paperEdge: TONE.paperEdge,
  kraft: TONE.kraft,
  /** Glass: the ground through a pane — what floats over it (pills, search, the voice line). */
  glass: alpha(GROUND[hallLight()].base, 0.55),
  glassEdge: alpha(TONE.creamLight, 0.22),
} as const;

// expo-image's web cross-dissolve can stall at the first frame; native fades are fine.
const FADE = Platform.OS === 'web' ? 0 : 250;

export const sceneFont = {
  display: 'Alegreya_700Bold',
  displayItalic: 'Alegreya_700Bold_Italic',
  italic: 'Alegreya_500Medium_Italic',
  /** The vendor's hand — only on a price sign (`Sign`, the product's own sign). */
  hand: 'Caveat_700Bold',
  ui: 'Manrope_700Bold',
  uiHeavy: 'Manrope_800ExtraBold',
  uiText: 'Manrope_600SemiBold',
} as const;

/** Capitals — the eyebrow's type (Manrope 800, 12 px, 0.14em) — for labels that pick their colour. */
export const caps = {
  fontFamily: sceneFont.uiHeavy,
  ...scale.caption,
  letterSpacing: scale.caption.fontSize * 0.14,
  textTransform: 'uppercase',
} as const;

/**
 * A horizontal rail clips what it scrolls: this much room under its cards for the one
 * shadow's reach (12 down, 14 blur), handed back by a negative margin (the web's `.rail`).
 */
export const SHADOW_REACH = 26;

/** The two photographs of the rows that hang at the door, and which one it is now. */
export const SCENES = {
  morning: require('../../../assets/scenes/morning.jpg') as ImageSource,
  evening: require('../../../assets/scenes/evening.jpg') as ImageSource,
};

/**
 * The ground's deep at an opacity. A scrim exists to carry a photograph into the hall,
 * so it has to be the hall's own colour — never black, never a literal of its own.
 */
export const ground = (a: number) => alpha(GROUND[hallLight()].deep, a);

/**
 * A photograph filling the screen with the scrims that carry it into the hall; no
 * photograph — the hall itself. Children on top.
 */
export function Scene({
  source,
  children,
  evening = false,
  style,
}: {
  source: ImageSource | string | null | undefined;
  children: ReactNode;
  /** Deeper scrim and the lamps' glow, for the night bazaar at the door. */
  evening?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const uri = typeof source === 'string' ? { uri: source } : source;
  if (!uri) {
    return (
      <View style={[s.scene, style]}>
        <DomeGround />
        {children}
      </View>
    );
  }
  return (
    <View style={[s.scene, style]}>
      <Image
        source={uri}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={FADE}
        priority="high"
        cachePolicy="memory-disk"
      />
      {/* One camera: the grade belongs to the picture, under the scrims and the content. */}
      <PhotoGrade />
      <LinearGradient
        colors={
          evening
            ? [ground(0.7), ground(0.1), ground(0.05), ground(0.7), ground(0.98)]
            : [ground(0.55), ground(0.05), ground(0), ground(0.55), ground(0.95)]
        }
        locations={[0, 0.22, 0.4, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />
      {evening ? (
        <LinearGradient
          colors={[alpha(GROUND.evening.light, 0.45), alpha(GROUND.evening.light, 0)]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0.4, y: 0.45 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {children}
    </View>
  );
}

/** The 40 px cream circle every scene uses for back / bell / heart. */
export function SceneButton({
  children,
  onPress,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      style={({ pressed }) => [s.button, press.base, pressed && press.down, style]}
    >
      {children}
    </Pressable>
  );
}

/** Reads the top inset once so scenes can place their header under the notch. */
export function useSceneTop(): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.top, 24) + 10;
}

/** Serif display text on the ground: greetings, names, section heads — at a step of the scale. */
export function Display({
  children,
  step = 'display',
  italic = false,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  step?: 'display' | 'headline' | 'title';
  italic?: boolean;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const size = scale[step];
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          fontFamily: italic ? sceneFont.displayItalic : sceneFont.display,
          ...size,
          color: scene.cream,
          letterSpacing: -size.fontSize * 0.012,
          textShadowColor: ground(0.5),
          textShadowOffset: { width: 0, height: 2 },
          textShadowRadius: 8,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** A spoken line in Alegreya italic: the vendor's motto, a review, the scene's quiet asides. */
export function Say({
  children,
  step = 'title',
  color = scene.cream,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  step?: 'lead' | 'title';
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          fontFamily: sceneFont.italic,
          ...scale[step],
          color,
          textShadowColor: ground(0.6),
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 4,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** The one eyebrow: capitals in ochre over the ground — dates, section eyebrows. */
export function Eyebrow({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[s.eyebrow, style]}>{children}</Text>;
}

/** Section head on a scene: serif title left, ochre link right. */
export function SceneHead({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={s.head}>
      <Display step="title">{title}</Display>
      {action ? (
        <Pressable onPress={onAction} hitSlop={14} accessibilityRole="link">
          <Text style={s.headAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Kraft luggage tag with the punched hole: «Чорсу · утро · +18°» (the degrees are live). */
export function KraftTag({ children, tilt = -2 }: { children: ReactNode; tilt?: number }) {
  return (
    <View style={[s.tag, { transform: [{ rotate: `${tilt}deg` }] }]}>
      <View style={s.tagHole} />
      <Text style={s.tagText}>{children}</Text>
    </View>
  );
}

/** The pushpin on a price sign's top edge — price signs only. */
export function Pin() {
  return <View style={s.pin} />;
}

/**
 * A price sign swings on its pin when its product lands in the basket (0 → 1): a push, then
 * a damped spring back to rest. Rotate about the top edge. Still under «Уменьшить движение».
 */
export function useSwing(count: number): Animated.AnimatedInterpolation<string> {
  const angle = useRef(new Animated.Value(0)).current;
  const still = useReducedMotion();
  const was = useRef(count);
  useEffect(() => {
    if (was.current === 0 && count > 0 && !still) {
      angle.setValue(0);
      Animated.sequence([
        Animated.timing(angle, {
          toValue: 4,
          duration: 110,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(angle, { toValue: 0, stiffness: 180, damping: 6, useNativeDriver: true }),
      ]).start();
    }
    was.current = count;
  }, [count, still, angle]);
  // One node for the sign's life: a fresh interpolation per render would re-attach the view.
  return useMemo(
    () => angle.interpolate({ inputRange: [-1, 1], outputRange: ['-1deg', '1deg'] }),
    [angle],
  );
}

/** How far a receipt travels out of the printer, px. */
const PRINT_TRAVEL = 24;

/**
 * A receipt comes out of the printer: when it first appears it slides down into place, once.
 * Still under «Уменьшить движение».
 */
export function Printed({ children }: { children: ReactNode }) {
  const still = useReducedMotion();
  const y = useRef(new Animated.Value(still ? 0 : -PRINT_TRAVEL)).current;
  useEffect(() => {
    if (still) return;
    Animated.timing(y, {
      toValue: 0,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [y, still]);
  return <Animated.View style={{ transform: [{ translateY: y }] }}>{children}</Animated.View>;
}

/**
 * Cardboard price sign as on Chorsu: the name in the vendor's marker, the price
 * below, a note in small type, a pushpin on the top edge — it swings on the pin
 * when the product goes into the basket. `count` swaps the "+" for "N в корзине".
 */
export function Sign({
  title,
  price,
  say,
  note,
  count = 0,
  countLabel,
  accent = false,
  compact = false,
  tilt = 0,
  onPress,
  onAdd,
  style,
}: {
  title: string;
  price?: string | undefined;
  /** The vendor's own line, in their handwriting: «выбираю по хвостику». */
  say?: string | undefined;
  note?: string | undefined;
  count?: number;
  countLabel?: string;
  /** The ochre sign for "ещё N →". */
  accent?: boolean;
  /** Half-width sign: smaller marker, three lines for «Грецкий орех, ядро». */
  compact?: boolean;
  tilt?: number;
  onPress?: () => void;
  onAdd?: () => void;
  /** Where the sign stands (width, margins); the sign's own paper is its own. */
  style?: StyleProp<ViewStyle>;
}) {
  const swing = useSwing(count);
  return (
    // The sign hangs from its pin: tilt and swing turn it about the top edge.
    <Animated.View
      style={[
        style,
        { transformOrigin: 'top', transform: [{ rotate: `${tilt}deg` }, { rotate: swing }] },
      ]}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          s.sign,
          compact && s.signCompact,
          accent && s.signAccent,
          count > 0 && s.signChosen,
          press.base,
          pressed && press.down,
        ]}
      >
        <Pin />
        <Text style={[s.signTitle, compact && s.signTitleCompact]} numberOfLines={compact ? 3 : 2}>
          {title}
        </Text>
        {price ? <Text style={[s.signPrice, accent && { color: scene.ink }]}>{price}</Text> : null}
        {say ? (
          <Text style={s.signSay} numberOfLines={2}>
            «{say}»
          </Text>
        ) : null}
        {note ? (
          <Text style={[s.signNote, accent && { color: scene.ink }]} numberOfLines={1}>
            {note}
          </Text>
        ) : null}
        {onAdd ? (
          <Pressable
            onPress={onAdd}
            hitSlop={9}
            style={({ pressed }) => [
              s.plus,
              count > 0 && s.plusChosen,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={[s.plusText, count > 0 && s.plusTextChosen]}>
              {count > 0 ? (countLabel ?? String(count)) : '+'}
            </Text>
          </Pressable>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/**
 * A product on the counter: its photograph (4:5) with the cardboard sign pinned
 * over the bottom edge — the sign carries the name, the price and the "+".
 */
export function ProductCard({
  photo,
  tilt = 0,
  side = 'left',
  compact = false,
  onPress,
  style,
  ...sign
}: {
  photo: string | null;
  tilt?: number;
  /** Which corner of the photograph the sign hangs from. */
  side?: 'left' | 'right';
  /** Two to a row: the sign across the whole card, no vendor line. */
  compact?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  title: string;
  price?: string | undefined;
  say?: string | undefined;
  note?: string | undefined;
  count?: number;
  countLabel?: string;
  onAdd?: () => void;
}) {
  return (
    <View style={[s.card, style]}>
      {/* The frame carries the shadow; the photograph is clipped inside it (iOS drops the
          shadow of a view that clips). */}
      <View style={s.cardFrame}>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [s.cardPhoto, pressed && { opacity: 0.9 }]}
        >
          {photo ? (
            <>
              <Image
                source={{ uri: photo }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={FADE}
                cachePolicy="memory-disk"
              />
              <PhotoGrade />
            </>
          ) : null}
          <LinearGradient
            colors={['transparent', ground(0.55)]}
            locations={[0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
        </Pressable>
      </View>
      <Sign
        {...sign}
        {...(compact ? { say: undefined } : {})}
        compact={compact}
        tilt={tilt}
        {...(onPress ? { onPress } : {})}
        style={[
          s.cardSign,
          side === 'right' && { marginLeft: 56, marginRight: 14 },
          compact && s.cardSignCompact,
        ]}
      />
    </View>
  );
}

/** A row's label: kraft, the name in capitals, for «Зелень · Фрукты · Нон». `active` = the chosen one, in ochre. */
export function RowSign({
  title,
  tilt = 0,
  active = false,
  onPress,
}: {
  title: string;
  tilt?: number;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        s.rowSign,
        active && s.rowSignActive,
        { transform: [{ rotate: `${tilt}deg` }] },
        press.base,
        pressed && press.down,
      ]}
    >
      <Text style={s.rowSignText}>{title}</Text>
    </Pressable>
  );
}

/** A shop on the home rail: the painted board over the door — name, hours, an ochre rule. */
export function ShopSign({
  name,
  line,
  logo,
  onPress,
  width = 150,
}: {
  name: string;
  line: string | null;
  logo?: string | null;
  onPress?: () => void;
  width?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.shopSign, { width }, press.base, pressed && press.down]}
    >
      {logo ? (
        <Image
          source={{ uri: logo }}
          style={s.shopLogo}
          contentFit="contain"
          transition={FADE}
          cachePolicy="memory-disk"
        />
      ) : null}
      <Text style={s.shopSignName} numberOfLines={2}>
        {name}
      </Text>
      <View style={s.shopRule} />
      {line ? (
        <Text style={s.shopSignLine} numberOfLines={1}>
          {line}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** A person: a portrait card (3:4), the name, and their line in italic. */
export function VendorCard({
  photo,
  name,
  line,
  onPress,
  width = 110,
}: {
  photo: string | null;
  name: string;
  line: string | null;
  onPress?: () => void;
  width?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.vendor,
        { width, height: Math.round((width * 4) / 3) },
        press.base,
        pressed && press.down,
      ]}
    >
      {/* Clipped inside; the card itself keeps the shadow, as ProductCard's frame does. */}
      <View style={s.vendorPhoto}>
        {photo ? (
          <>
            <Image
              source={{ uri: photo }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={FADE}
              cachePolicy="memory-disk"
            />
            <PhotoGrade />
          </>
        ) : null}
        <LinearGradient
          colors={['transparent', ground(0.92)]}
          locations={[0.4, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <View style={s.vendorText}>
        <Text style={s.vendorName} numberOfLines={1}>
          {name}
        </Text>
        {line ? (
          <Text style={s.vendorLine} numberOfLines={2}>
            «{line}»
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Glass: the voice line, pills and search over the ground. A pill unless `style` says otherwise. */
export function Glass({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  // A tappable pane is the Pressable itself, so `style` (flex, size) lays out the pane.
  return onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [s.glass, style, press.base, pressed && press.down]}
    >
      {children}
    </Pressable>
  ) : (
    <View style={[s.glass, style]}>{children}</View>
  );
}

/** Pomegranate cart disc with the count badge. */
export function CartDisc({ count, onPress }: { count: number; onPress: () => void }) {
  const { t } = useLocale();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={t('a11y.cart')}
      style={({ pressed }) => [s.cart, press.base, pressed && press.down]}
    >
      <BasketGlyph color={scene.cream} />
      {count > 0 ? (
        <View style={s.cartBadge}>
          <Text style={s.cartBadgeText}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Basket outline in scene colours (kept local: the theme icons are 1 px thinner). */
export function BasketGlyph({ color = scene.cream, size = 24 }: { color?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-end' }}>
      <View
        style={{
          width: size * 0.9,
          height: size * 0.5,
          borderWidth: 2,
          borderColor: color,
          borderRadius: 3,
          borderTopWidth: 2,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: size * 0.1,
          left: size * 0.22,
          width: 2,
          height: size * 0.36,
          backgroundColor: color,
          transform: [{ rotate: '30deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: size * 0.1,
          right: size * 0.22,
          width: 2,
          height: size * 0.36,
          backgroundColor: color,
          transform: [{ rotate: '-30deg' }],
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  scene: { flex: 1, backgroundColor: ground(1), overflow: 'hidden' },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: alpha(TONE.creamLight, 0.92),
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.paper,
  },
  eyebrow: {
    ...caps,
    color: scene.ochreLight,
    textShadowColor: ground(0.9),
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 20,
  },
  headAction: { fontFamily: sceneFont.uiHeavy, ...scale.caption, color: scene.ochreLight },
  tag: {
    backgroundColor: scene.kraft,
    borderRadius: radius.paper,
    paddingVertical: 5,
    paddingLeft: 18,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadow.paper,
  },
  // Punched through: the ground shows in the hole.
  tagHole: {
    position: 'absolute',
    left: 7,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: ground(1),
  },
  tagText: { fontFamily: sceneFont.italic, ...scale.lead, color: scene.ink },
  sign: {
    flexGrow: 1,
    backgroundColor: scene.paper,
    borderWidth: 1,
    borderColor: scene.paperEdge,
    borderRadius: radius.paper,
    paddingTop: 7,
    paddingBottom: 8,
    paddingHorizontal: 12,
    gap: 2,
    ...shadow.paper,
  },
  signCompact: { paddingHorizontal: 10 },
  signAccent: { backgroundColor: scene.ochre, borderColor: TONE.ochreDeep },
  signChosen: { borderColor: scene.ochre, borderWidth: 2 },
  pin: {
    position: 'absolute',
    top: -5,
    left: '50%',
    marginLeft: -4,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: scene.pomegranate,
    borderWidth: 1,
    borderColor: TONE.pomegranateDeep,
  },
  signTitle: {
    fontFamily: sceneFont.hand,
    ...scale.title,
    color: scene.ink,
    textTransform: 'uppercase',
    paddingRight: 16,
  },
  // «Мирзачульская» has to fit a half-width sign in one piece.
  signTitleCompact: { ...scale.lead, paddingRight: 10, letterSpacing: -0.2 },
  signPrice: {
    fontFamily: sceneFont.hand,
    ...scale.lead,
    color: scene.pomegranate,
    fontVariant: ['tabular-nums'],
  },
  signSay: { fontFamily: sceneFont.hand, ...scale.lead, color: scene.inkSoft, marginTop: 2 },
  // The note can be a sum (a shop's old price): tabular, like every figure.
  signNote: {
    fontFamily: sceneFont.ui,
    ...scale.caption,
    color: scene.inkSoft,
    fontVariant: ['tabular-nums'],
  },
  // The "+" lies on the sign's paper: flat.
  plus: {
    position: 'absolute',
    right: -8,
    top: -8,
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 6,
    backgroundColor: scene.pomegranate,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Chosen: the badge hangs off the bottom corner so it never sits on the name.
  plusChosen: { backgroundColor: scene.ochre, paddingHorizontal: 8, top: 'auto', bottom: -10 },
  plusText: { fontFamily: sceneFont.uiHeavy, ...scale.lead, color: scene.cream },
  plusTextChosen: { ...scale.caption, color: scene.ink, fontVariant: ['tabular-nums'] },
  card: { paddingBottom: 6 },
  cardFrame: {
    aspectRatio: 4 / 5,
    borderRadius: radius.photo,
    backgroundColor: scene.kraft,
    ...shadow.paper,
  },
  cardPhoto: { ...StyleSheet.absoluteFill, borderRadius: radius.photo, overflow: 'hidden' },
  cardSign: { marginTop: -30, marginLeft: 14, marginRight: 56 },
  cardSignCompact: { marginTop: -26, marginLeft: 6, marginRight: 6 },
  shopSign: {
    minHeight: 96,
    borderRadius: radius.paper,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'flex-end',
    gap: 4,
    backgroundColor: scene.board,
    borderWidth: 1,
    borderColor: alpha(HALL.ochre, 0.35),
    ...shadow.paper,
  },
  shopLogo: { width: 36, height: 36, marginBottom: 4 },
  shopSignName: {
    fontFamily: sceneFont.display,
    ...scale.lead,
    letterSpacing: 0.3,
    color: scene.ochreLight,
  },
  shopRule: { height: 2, width: 28, backgroundColor: scene.ochre, borderRadius: radius.pill },
  shopSignLine: { fontFamily: sceneFont.uiText, ...scale.caption, color: scene.creamMuted },
  // A kraft label: no pin (pins are for price signs), the name in capitals.
  rowSign: {
    backgroundColor: scene.kraft,
    borderRadius: radius.paper,
    paddingVertical: 6,
    paddingHorizontal: 12,
    ...shadow.paper,
  },
  rowSignActive: { backgroundColor: scene.ochre },
  rowSignText: { ...caps, color: scene.ink },
  vendor: {
    borderRadius: radius.photo,
    backgroundColor: scene.kraft,
    ...shadow.paper,
  },
  vendorPhoto: { ...StyleSheet.absoluteFill, borderRadius: radius.photo, overflow: 'hidden' },
  vendorText: { position: 'absolute', left: 10, right: 10, bottom: 10, gap: 2 },
  vendorName: { fontFamily: sceneFont.display, ...scale.body, color: scene.cream },
  vendorLine: { fontFamily: sceneFont.italic, ...scale.body, color: scene.ochreLight },
  glass: {
    backgroundColor: scene.glass,
    borderWidth: 1,
    borderColor: scene.glassEdge,
    borderRadius: radius.pill,
  },
  cart: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: scene.pomegranate,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.paper,
  },
  cartBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: scene.ochre,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeText: {
    fontFamily: sceneFont.uiHeavy,
    ...scale.caption,
    color: scene.ink,
    fontVariant: ['tabular-nums'],
  },
});
