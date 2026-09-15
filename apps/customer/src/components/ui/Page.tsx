/**
 * The screen frame of the redesign: a soft mint→peach ground, a slim header
 * with a round back button, scrolling content in 16px gutters, and room at
 * the bottom for the tab bar or a sticky footer. Every customer screen that
 * is not a map is one of these.
 */
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArrowLeft, Bag, Button, Text, color, press, shadow, useLocale } from '@bazar/mobile';

import { useCartCount } from '@/features/cart/store';

/** Ground and surfaces of the redesign; the brand colours stay in @bazar/mobile's theme. */
export const ui = {
  mint: color.surface,
  peach: color.surface,
  mintDeep: color.brand50,
  peachDeep: color.sand100,
  /** Cards are grey tiles on a white page — Megamarket's register, our green. */
  card: color.tile,
  white: color.surface,
  brand: color.brand500,
  brandDeep: color.brand600,
  brandSoft: color.brand50,
  radius: 20,
  shadow: shadow.card,
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
      <LinearGradient
        colors={[ui.mint, ui.peach]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
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
        {glass ? (
          <BlurView
            intensity={36}
            tint={color.blurTint}
            experimentalBlurMethod="dimezisBlurView"
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
          <Text role="section" numberOfLines={1} style={{ flex: 1, fontSize: 20 }}>
            {title ?? ''}
          </Text>
        )}
        {right}
        {cart ? (
          <Round onPress={() => router.push('/cart')} label={t('a11y.cart')} glass={floating}>
            <Bag size={20} />
            {count > 0 ? (
              <View style={s.badge}>
                <Text role="caption" style={{ color: color.white, fontSize: 10, lineHeight: 12 }}>
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
              tintColor={ui.brandDeep}
              colors={[ui.brandDeep]}
              progressViewOffset={floating ? insets.top + 56 : 0}
            />
          ) : undefined
        }
      >
        {children}
      </Animated.ScrollView>
      {footer ? (
        <View style={[s.footer, { paddingBottom: (tabs ? TAB_BAR_SPACE : 12) + insets.bottom }]}>
          <LinearGradient
            colors={[...color.fade]}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
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
      {glass ? (
        <BlurView
          intensity={40}
          tint={color.blurTint}
          experimentalBlurMethod="dimezisBlurView"
          style={s.glassFill}
        />
      ) : null}
      <View style={{ zIndex: 1 }}>{children}</View>
    </Pressable>
  );
}

/** A white surface with the redesign's radius and shadow. */
export function Card({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return <View style={[s.card, style]}>{children}</View>;
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

/** "Could not load · Retry" — the one error surface every list shares. */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useLocale();
  return (
    <Card style={s.error}>
      <Text role="muted" style={{ flex: 1 }}>
        {t('common.loadError')}
      </Text>
      <Button
        label={t('common.retry')}
        variant="secondary"
        style={{ height: 40, paddingHorizontal: 14 }}
        onPress={onRetry}
      />
    </Card>
  );
}

/** Nothing here yet: a 3D icon, a title, a line, one thing to do. */
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
  return (
    <Card style={s.empty}>
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
    </Card>
  );
}

/** Skeleton block while data loads: a soft pulse on the card tint. */
export function Bone({ style }: { style?: StyleProp<ViewStyle> }) {
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
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
  root: { flex: 1, backgroundColor: ui.mint },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerSlot: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  floating: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 5 },
  glassBar: {
    paddingBottom: 10,
    backgroundColor: color.glass,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  glassFillBar: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  glyph: { alignItems: 'center', justifyContent: 'center' },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.field,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glass: { backgroundColor: color.glassSoft },
  glassFill: { ...StyleSheet.absoluteFillObject, borderRadius: 20, overflow: 'hidden' },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: ui.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: 16, paddingTop: 4 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 28,
  },
  card: { backgroundColor: ui.card, borderRadius: ui.radius, ...ui.shadow },
  bone: { backgroundColor: color.field, borderRadius: 20 },
  empty: { alignItems: 'center', padding: 24, paddingVertical: 36, marginTop: 12 },
  error: {
    marginTop: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionHead: {
    marginTop: 24,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
});
