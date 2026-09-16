/**
 * The bazaar scene language: a photograph fills the screen, everything else
 * sits on it — a serif greeting, a vendor's own words in handwriting, cardboard
 * price signs with a pushpin, kraft tags. No frames, no tab bar: the row is the
 * navigation. Colours are the scene's own (kraft, pomegranate, saffron) and do
 * not follow the app theme — a scene is the same at night.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Image, type ImageSource } from 'expo-image';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { press } from '@bazar/mobile';

export const scene = {
  cream: '#FBF1DE',
  creamMuted: '#F3E3C4',
  creamDim: '#C9B89A',
  ink: '#2B1B0E',
  inkSoft: '#6A5A44',
  pomegranate: '#9E2A2B',
  saffron: '#E39B2F',
  saffronLight: '#F2B85A',
  night: '#1E1408',
  paper: '#F4EFE4',
  paperEdge: '#C9B99A',
  kraft: '#EAD8B2',
  glass: 'rgba(251,241,222,0.12)',
  glassEdge: 'rgba(251,241,222,0.22)',
} as const;

// expo-image's web cross-dissolve can stall at the first frame; native fades are fine.
const FADE = Platform.OS === 'web' ? 0 : 250;

export const sceneFont = {
  display: 'Alegreya_700Bold',
  displayItalic: 'Alegreya_700Bold_Italic',
  italic: 'Alegreya_500Medium_Italic',
  hand: 'Caveat_700Bold',
  ui: 'Manrope_700Bold',
  uiHeavy: 'Manrope_800ExtraBold',
  uiText: 'Manrope_600SemiBold',
} as const;

/** Full-bleed photograph with the warm scrims; children are laid out on top. */
export function Scene({
  source,
  children,
  evening = false,
  style,
}: {
  source: ImageSource | string | null | undefined;
  children: ReactNode;
  /** Deeper, amber-lit scrim for the night bazaar. */
  evening?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const uri = typeof source === 'string' ? { uri: source } : source;
  return (
    <View style={[s.scene, style]}>
      {uri ? (
        <Image
          source={uri}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={FADE}
          priority="high"
          cachePolicy="memory-disk"
        />
      ) : null}
      <LinearGradient
        colors={
          evening
            ? ['rgba(20,16,12,0.7)', 'rgba(20,16,12,0.1)', 'rgba(20,16,12,0.05)', 'rgba(20,16,12,0.7)', 'rgba(20,16,12,0.98)']
            : ['rgba(20,12,4,0.55)', 'rgba(20,12,4,0.05)', 'rgba(20,12,4,0)', 'rgba(24,14,4,0.55)', 'rgba(24,14,4,0.95)']
        }
        locations={[0, 0.22, 0.4, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />
      {evening ? (
        <LinearGradient
          colors={['rgba(242,169,59,0.45)', 'rgba(242,169,59,0)']}
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

/** Serif display text: greetings, names, section heads. */
export function Display({
  children,
  size = 46,
  italic = false,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  size?: number;
  italic?: boolean;
  style?: StyleProp<ViewStyle>;
  numberOfLines?: number;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          fontFamily: italic ? sceneFont.displayItalic : sceneFont.display,
          fontSize: size,
          lineHeight: Math.round(size * 0.98),
          color: scene.cream,
          letterSpacing: -size * 0.012,
          textShadowColor: 'rgba(0,0,0,0.5)',
          textShadowOffset: { width: 0, height: 2 },
          textShadowRadius: 8,
        },
        style as never,
      ]}
    >
      {children}
    </Text>
  );
}

/** Handwriting: the vendor's own line, prices on signs. */
export function Hand({
  children,
  size = 24,
  color = scene.cream,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  numberOfLines?: number;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          fontFamily: sceneFont.hand,
          fontSize: size,
          lineHeight: Math.round(size * 1.05),
          color,
          textShadowColor: 'rgba(0,0,0,0.6)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 4,
        },
        style as never,
      ]}
    >
      {children}
    </Text>
  );
}

/** Small caps label in saffron: dates, section eyebrows. */
export function Eyebrow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Text style={[s.eyebrow, style as never]}>{children}</Text>
  );
}

/** Section head on a scene: serif title left, saffron link right. */
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
      <Display size={21}>{title}</Display>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={s.headAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Kraft luggage tag with the punched hole: "Чорсу · утро · +18°". */
export function KraftTag({ children, tilt = -2 }: { children: ReactNode; tilt?: number }) {
  return (
    <View style={[s.tag, { transform: [{ rotate: `${tilt}deg` }] }]}>
      <View style={s.tagHole} />
      <Text style={s.tagText}>{children}</Text>
    </View>
  );
}

/**
 * Cardboard price sign as on Chorsu: uppercase name in marker, price below,
 * a note in small type, a red pushpin on the top edge. `count` swaps the "+"
 * for "N в корзине".
 */
export function Sign({
  title,
  price,
  note,
  count = 0,
  countLabel,
  accent = false,
  tilt = 0,
  onPress,
  onAdd,
  style,
}: {
  title: string;
  price?: string | undefined;
  note?: string | undefined;
  count?: number;
  countLabel?: string;
  /** Saffron card for "ещё N →". */
  accent?: boolean;
  tilt?: number;
  onPress?: () => void;
  onAdd?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.sign,
        accent && s.signAccent,
        count > 0 && s.signChosen,
        { transform: [{ rotate: `${tilt}deg` }] },
        press.base,
        pressed && press.down,
        style,
      ]}
    >
      <View style={s.pin} />
      <Text style={s.signTitle} numberOfLines={2}>
        {title}
      </Text>
      {price ? <Text style={[s.signPrice, accent && { color: scene.ink }]}>{price}</Text> : null}
      {note ? (
        <Text style={[s.signNote, accent && { color: '#5A3E12' }]} numberOfLines={1}>
          {note}
        </Text>
      ) : null}
      {onAdd ? (
        <Pressable
          onPress={onAdd}
          hitSlop={8}
          style={({ pressed }) => [s.plus, count > 0 && s.plusChosen, pressed && { opacity: 0.8 }]}
        >
          <Text style={[s.plusText, count > 0 && { color: scene.ink, fontSize: 12 }]}>
            {count > 0 ? (countLabel ?? String(count)) : '+'}
          </Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

/** Row-name sign: just the uppercase word, for "Зелень · Фрукты · Нон". */
export function RowSign({ title, tilt = 0, onPress }: { title: string; tilt?: number; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.rowSign, { transform: [{ rotate: `${tilt}deg` }] }, press.base, pressed && press.down]}
    >
      <View style={s.pin} />
      <Text style={s.rowSignText}>{title}</Text>
    </Pressable>
  );
}

/** A person: tall photo card, name, and their line in handwriting. */
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
      style={({ pressed }) => [s.vendor, { width, height: Math.round(width * 1.36) }, press.base, pressed && press.down]}
    >
      {photo ? (
        <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={FADE} cachePolicy="memory-disk" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#5A3E22' }]} />
      )}
      <LinearGradient
        colors={['transparent', 'rgba(20,12,4,0.92)']}
        locations={[0.4, 1]}
        style={StyleSheet.absoluteFill}
      />
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

/** The frosted pill/bar used for the voice line, chips and secondary buttons. */
export function Glass({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const body = <View style={[s.glass, style]}>{children}</View>;
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [press.base, pressed && press.down]}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

/** Pomegranate cart disc with the count badge. */
export function CartDisc({ count, onPress, evening = false }: { count: number; onPress: () => void; evening?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [s.cart, evening && s.cartEvening, press.base, pressed && press.down]}
    >
      <BasketGlyph color={evening ? scene.night : scene.cream} />
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
  // A box-drawn basket keeps this file free of react-native-svg on web.
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-end' }}>
      <View style={{ width: size * 0.9, height: size * 0.5, borderWidth: 2, borderColor: color, borderRadius: 3, borderTopWidth: 2 }} />
      <View style={{ position: 'absolute', top: size * 0.1, left: size * 0.22, width: 2, height: size * 0.36, backgroundColor: color, transform: [{ rotate: '30deg' }] }} />
      <View style={{ position: 'absolute', top: size * 0.1, right: size * 0.22, width: 2, height: size * 0.36, backgroundColor: color, transform: [{ rotate: '-30deg' }] }} />
    </View>
  );
}

const s = StyleSheet.create({
  scene: { flex: 1, backgroundColor: scene.night, overflow: 'hidden' },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(251,241,222,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  eyebrow: {
    fontFamily: sceneFont.uiHeavy,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: scene.saffronLight,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 20 },
  headAction: { fontFamily: sceneFont.uiHeavy, fontSize: 12, color: scene.saffronLight },
  tag: {
    backgroundColor: scene.kraft,
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    paddingVertical: 5,
    paddingLeft: 18,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  tagHole: { position: 'absolute', left: 7, width: 5, height: 5, borderRadius: 3, backgroundColor: '#6E4A22' },
  tagText: { fontFamily: sceneFont.hand, fontSize: 18, lineHeight: 20, color: scene.ink },
  sign: {
    backgroundColor: scene.paper,
    borderWidth: 1,
    borderColor: scene.paperEdge,
    paddingTop: 7,
    paddingBottom: 8,
    paddingHorizontal: 12,
    gap: 2,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  signAccent: { backgroundColor: '#EDB24A', borderColor: '#B8781E' },
  signChosen: { borderColor: scene.saffron, borderWidth: 2 },
  pin: {
    position: 'absolute',
    top: -5,
    left: '50%',
    marginLeft: -4,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#B42A31',
    borderWidth: 1,
    borderColor: '#8E1F26',
  },
  signTitle: { fontFamily: sceneFont.hand, fontSize: 21, lineHeight: 22, color: '#1F1A14', textTransform: 'uppercase' },
  signPrice: { fontFamily: sceneFont.hand, fontSize: 17, lineHeight: 18, color: scene.pomegranate },
  signNote: { fontFamily: sceneFont.ui, fontSize: 12, lineHeight: 14, color: scene.inkSoft },
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
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  plusChosen: { backgroundColor: scene.saffron, paddingHorizontal: 8 },
  plusText: { fontFamily: sceneFont.uiHeavy, fontSize: 17, lineHeight: 19, color: scene.cream },
  rowSign: {
    backgroundColor: scene.paper,
    borderWidth: 1,
    borderColor: scene.paperEdge,
    paddingVertical: 4,
    paddingHorizontal: 11,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  rowSignText: { fontFamily: sceneFont.hand, fontSize: 19, lineHeight: 21, color: '#1F1A14', textTransform: 'uppercase' },
  vendor: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#3A2A1A',
    shadowColor: '#000',
    shadowOpacity: 0.7,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  vendorText: { position: 'absolute', left: 10, right: 10, bottom: 10, gap: 2 },
  vendorName: { fontFamily: sceneFont.uiHeavy, fontSize: 12.5, color: scene.cream },
  vendorLine: { fontFamily: sceneFont.hand, fontSize: 15, lineHeight: 16, color: scene.saffronLight },
  // A smoked-glass pill: dark enough to read on a bright melon, light enough to sit on night.
  glass: {
    backgroundColor: 'rgba(30,20,8,0.42)',
    borderWidth: 1,
    borderColor: scene.glassEdge,
    borderRadius: 18,
  },
  cart: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: scene.pomegranate,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: scene.pomegranate,
    shadowOpacity: 0.7,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  cartEvening: { backgroundColor: '#F2A93B', shadowColor: '#F2A93B' },
  cartBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: scene.saffron,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeText: { fontFamily: sceneFont.uiHeavy, fontSize: 11, color: scene.ink },
});
