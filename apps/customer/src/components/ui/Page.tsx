/**
 * The screen frame: the hall underneath, a slim header with a round back
 * button and the title in cream serif, scrolling content in 16px gutters, and
 * room at the bottom for the tab bar or a sticky glass footer. Every customer
 * screen that is not a map is one of these; its content lies on paper.
 */
import { BlurView } from 'expo-blur';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ArrowLeft,
  Bag,
  Button,
  DomeGround,
  Text,
  color,
  press,
  radius,
  scale,
  shadow,
  useLocale,
} from '@bazar/mobile';

import { useCartCount } from '@/features/cart/store';
import { FROSTED, ground, scene, sceneFont } from '@/components/bazar';

/** The brand colours and the rhythm; the ground is the hall, the surfaces are @bazar/mobile's theme. */
export const ui = {
  brand: color.brand500,
  brandDeep: color.brand600,
  brandSoft: color.brand50,
  /** The rhythm: gutters 16, gaps between siblings 12, card padding 14, sections 24 apart. */
  gap: 12,
  pad: 14,
  section: 24,
} as const;

/** The space the floating tab bar takes at the bottom of tab screens. */
export const TAB_BAR_SPACE = 80;

export function Page({
  title,
  back,
  right,
  cart = false,
  tabs = false,
  footer,
  children,
  contentStyle,
  header,
  floating = false,
  glass = false,
  onRefresh,
  scrollY,
}: {
  title?: string;
  /** Where the arrow goes; omitted = no arrow (a tab root). */
  back?: Href | 'history';
  right?: ReactNode;
  /** A cart button in the header (screens outside the tabs). */
  cart?: boolean;
  /** Leave room for the tab bar. */
  tabs?: boolean;
  /** Sticky bottom area (a primary button). */
  footer?: ReactNode;
  /** Custom header content instead of the title row. */
  header?: ReactNode;
  /** Buttons float over the content (a full-bleed hero underneath). */
  floating?: boolean;
  /** The header is a frosted pill that stays on top while the page scrolls under it. */
  glass?: boolean;
  /** Pull-to-refresh; resolve when the data is back. */
  onRefresh?: () => Promise<void>;
  /** Receives the scroll offset (parallax heroes, fading titles). */
  scrollY?: Animated.Value;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const count = useCartCount();
  const { t } = useLocale();
  const [refreshing, setRefreshing] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const refresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };
  const goBack = () => {
    if (router.canGoBack()) return router.back();
    router.replace(back === 'history' || !back ? '/' : back);
  };

  return (
    <View style={s.root}>
      <DomeGround />
      <View
        style={[
          s.header,
          (floating || glass) && s.floating,
          glass && s.glassBar,
          { paddingTop: insets.top + 8 },
          glass && { top: 0, paddingTop: insets.top + 10 },
        ]}
        onLayout={glass ? (e) => setHeaderHeight(e.nativeEvent.layout.height) : undefined}
      >
        {glass && FROSTED ? (
          <BlurView
            intensity={36}
            tint="dark"
            blurMethod="dimezisBlurView"
            style={s.glassFillBar}
            pointerEvents="none"
          />
        ) : null}
        {back ? (
          <Round onPress={goBack} label={t('common.back')} glass={floating}>
            <ArrowLeft size={20} />
          </Round>
        ) : null}
        {header ? (
          <View style={s.headerSlot}>{header}</View>
        ) : (
          <Text role="section" numberOfLines={1} style={s.title}>
            {title ?? ''}
          </Text>
        )}
        {right}
        {cart ? (
          <Round onPress={() => router.push('/cart')} label={t('a11y.cart')} glass={floating}>
            <Bag size={20} />
            {count > 0 ? (
              <View style={s.badge}>
                <Text role="caption" style={s.badgeText}>
                  {count}
                </Text>
              </View>
            ) : null}
          </Round>
        ) : null}
      </View>
      <Animated.ScrollView
        contentContainerStyle={[
          s.content,
          floating && { paddingTop: 0 },
          glass && { paddingTop: headerHeight + 8 },
          { paddingBottom: (tabs ? TAB_BAR_SPACE : 24) + (footer ? 84 : 0) + insets.bottom },
          contentStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={
          scrollY
            ? Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
                useNativeDriver: true,
              })
            : undefined
        }
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              tintColor={scene.ochreLight}
              colors={[ui.brandDeep]}
              progressViewOffset={floating ? insets.top + 56 : 0}
            />
          ) : undefined
        }
      >
        {children}
      </Animated.ScrollView>
      {footer ? (
        // A sticky bar over the ground is glass, never a solid band.
        <View style={[s.footer, { paddingBottom: (tabs ? TAB_BAR_SPACE : 12) + insets.bottom }]}>
          {FROSTED ? (
            <BlurView
              intensity={36}
              tint="dark"
              blurMethod="dimezisBlurView"
              style={s.glassFillBar}
              pointerEvents="none"
            />
          ) : null}
          {footer}
        </View>
      ) : null}
    </View>
  );
}

/** The round header button; `glass` frosts it over a photo instead of solid white. */
export function Round({
  onPress,
  label,
  glass = false,
  children,
}: {
  onPress: () => void;
  label: string;
  glass?: boolean;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [s.round, glass && s.glass, press.base, pressed && press.down]}
    >
      {glass && FROSTED ? (
        <BlurView
          intensity={40}
          tint={color.blurTint}
          blurMethod="dimezisBlurView"
          style={s.glassFill}
        />
      ) : null}
      <View style={{ zIndex: 1 }}>{children}</View>
    </Pressable>
  );
}

/** A paper slip lying on the hall: it lifts off the ground, so it carries the one shadow. */
export function Card({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return <View style={[s.card, shadow.paper, style]}>{children}</View>;
}

/** A tappable card: shrinks a little under the finger. */
export function PressCard({
  style,
  onPress,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.card, press.base, pressed && press.down, style]}
    >
      {children}
    </Pressable>
  );
}

/** "Could not load · Retry" — the one error surface every list shares: a paper slip, the line said aloud, one way to try again. */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useLocale();
  return (
    <View style={s.error}>
      <Text style={s.errorText}>{t('common.loadError')}</Text>
      <Pressable
        onPress={onRetry}
        hitSlop={4}
        style={({ pressed }) => [s.errorRetry, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
      >
        <Text style={s.errorRetryText}>{t('common.retry')} →</Text>
      </Pressable>
    </View>
  );
}

/** A line icon in a tinted disc — the one pictogram style, no emoji, no 3D. */
export function Glyph({
  icon: Icon,
  size = 48,
  tint = color.brand50,
  stroke = color.brand600,
  style,
}: {
  icon: (props: { size?: number; color?: string }) => ReactNode;
  size?: number;
  tint?: string;
  stroke?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: tint },
        s.glyph,
        style,
      ]}
    >
      <Icon size={Math.round(size * 0.46)} color={stroke} />
    </View>
  );
}

/** Nothing here yet: a glyph, a title, a line, one thing to do. */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  onAction,
}: {
  icon: (props: { size?: number; color?: string }) => ReactNode;
  title: string;
  hint?: string;
  action?: string;
  onAction?: () => void;
}) {
  // It sits on a screen's paper sheet: paper on paper lies flat, no shadow.
  return (
    <View style={[s.card, s.empty]}>
      <Glyph icon={Icon} size={88} />
      <Text role="title" style={{ marginTop: 12, textAlign: 'center' }}>
        {title}
      </Text>
      {hint ? (
        <Text role="muted" style={{ marginTop: 6, textAlign: 'center' }}>
          {hint}
        </Text>
      ) : null}
      {action && onAction ? (
        <Button label={action} style={{ marginTop: 20, alignSelf: 'stretch' }} onPress={onAction} />
      ) : null}
    </View>
  );
}

/** Skeleton block while data loads: a soft pulse on kraft; it holds still under «Уменьшить движение». */
export function Bone({ style }: { style?: StyleProp<ViewStyle> }) {
  const pulse = useRef(new Animated.Value(0.55)).current;
  const still = useReducedMotion();
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, still]);
  return <Animated.View style={[s.bone, { opacity: pulse }, style]} />;
}

/** Section heading with an optional "all →" link on the right. */
export function SectionHead({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={s.sectionHead}>
      <Text role="section">{title}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text role="muted" style={{ color: ui.brand, fontWeight: '500' }}>
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: ground(1) },
  // Top-aligned: a title on two lines («Гарантии и вопросы») keeps the back button on its first
  // line instead of floating between the two.
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerSlot: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  // The title stands on the ground: cream serif, whatever the theme.
  title: { flex: 1, fontFamily: sceneFont.display, ...scale.headline, color: scene.cream },
  floating: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 5 },
  glassBar: {
    paddingBottom: 10,
    backgroundColor: scene.glass,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: scene.glassEdge,
  },
  glassFillBar: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  glyph: { alignItems: 'center', justifyContent: 'center' },
  // A disc of the theme's paper over the hall: it lifts, so it carries the one shadow.
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.tile,
    borderWidth: 1,
    borderColor: color.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.paper,
  },
  glass: { backgroundColor: color.glassSoft },
  glassFill: { ...StyleSheet.absoluteFill, borderRadius: 20, overflow: 'hidden' },
  badge: {
    // Up and out on the disc's corner, ringed in its cream: it sat on the bag glyph itself.
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: scene.cream,
    backgroundColor: scene.ochre,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The count is the same badge as the tab bar's and the cart disc's: ochre, ink numerals.
  badgeText: { color: scene.ink, ...scale.caption, fontVariant: ['tabular-nums'] },
  content: { paddingHorizontal: 16, paddingTop: 4 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: scene.glass,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: scene.glassEdge,
  },
  // A paper slip: the theme's tile with its edge (light paper by day, lapis in the dark theme).
  card: {
    backgroundColor: color.tile,
    borderRadius: radius.paper,
    borderWidth: 1,
    borderColor: color.line,
  },
  bone: { backgroundColor: color.field, borderRadius: radius.paper },
  empty: { alignItems: 'center', padding: 24, paddingVertical: 36, marginTop: 12 },
  // The error slip lies on the ground in scenes and pages alike: fixed paper, the one shadow.
  error: {
    marginTop: 12,
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: scene.paper,
    borderWidth: 1,
    borderColor: scene.paperEdge,
    borderRadius: radius.paper,
    transform: [{ rotate: '-0.6deg' }],
    ...shadow.paper,
  },
  errorText: { flex: 1, fontFamily: sceneFont.italic, ...scale.lead, color: scene.ink },
  errorRetry: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: scene.pomegranate,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorRetryText: { fontFamily: sceneFont.display, ...scale.body, color: scene.cream },
  sectionHead: {
    marginTop: 24,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
});
