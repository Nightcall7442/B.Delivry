/**
 * The bottom bar: four tabs and the cart as a pomegranate disc in the middle
 * with the item count. A sticky bar over the hall, so it is glass.
 */
// SDK 57: expo-router's <Tabs> now ships its own bottom-tabs types instead of
// re-exporting @react-navigation/bottom-tabs, so the prop type has to come
// from there or the two copies don't structurally match.
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs/types';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useEffect, useRef, type ComponentType } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Bag,
  Grid,
  Home,
  Receipt,
  Text,
  User,
  color,
  press,
  radius,
  scale,
  shadow,
  useLocale,
} from '@bazar/mobile';
import type { MessageKey } from '@bazar/i18n';

import { FROSTED, scene } from '@/components/bazar';
import { useCartCount } from '@/features/cart/store';

import { ui } from './Page';

type IconComponent = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const TABS: ReadonlyArray<{ name: string; icon: IconComponent; label: MessageKey }> = [
  { name: 'index', icon: Home, label: 'tabs.home' },
  { name: 'categories', icon: Grid, label: 'tabs.categories' },
  { name: 'orders', icon: Receipt, label: 'tabs.orders' },
  { name: 'profile', icon: User, label: 'tabs.profile' },
];

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useLocale();
  const count = useCartCount();
  const current = state.routes[state.index]?.name;
  const still = useReducedMotion();
  // Something landed in the cart: the disc pops once (not under «Уменьшить движение»).
  const pop = useRef(new Animated.Value(1)).current;
  const previous = useRef(count);
  useEffect(() => {
    if (count > previous.current && !still) {
      pop.setValue(1);
      Animated.sequence([
        Animated.spring(pop, { toValue: 1.18, useNativeDriver: true, speed: 60, bounciness: 8 }),
        Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 10 }),
      ]).start();
    }
    previous.current = count;
  }, [count, pop, still]);
  const go = (name: string) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!event.defaultPrevented) navigation.navigate(name);
  };
  const [left, right] = [TABS.slice(0, 2), TABS.slice(2)];
  // The ochre rule slides to the active tab: layouts are measured once, the position springs
  // (and simply moves under «Уменьшить движение»).
  const slots = useRef<Record<string, { x: number; width: number }>>({});
  const pill = useRef(new Animated.ValueXY({ x: -100, y: 0 })).current;
  const moveTo = (name: string | undefined) => {
    const slot = name ? slots.current[name] : undefined;
    if (!slot) return;
    const to = { x: slot.x + slot.width / 2 - 14, y: 0 };
    if (still) return pill.setValue(to);
    // Native driver only: RN 0.86 throws if a JS-driven animation touches a
    // view that already has a native one (it was a warning on 0.76).
    Animated.spring(pill, { toValue: to, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
  };
  useEffect(() => {
    moveTo(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);
  // The front door is a scene: the row is its navigation, the cart its disc.
  // (After the hooks — the bar keeps its hook order when the tab changes.)
  if (current === 'index' || current === 'cart') return null;
  const Tab = ({ name, icon: Icon, label }: (typeof TABS)[number]) => {
    const active = current === name;
    return (
      <Pressable
        key={name}
        onPress={() => go(name)}
        style={s.tab}
        hitSlop={6}
        onLayout={(e) => {
          slots.current[name] = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width };
          if (current === name) moveTo(name);
        }}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={t(label)}
      >
        <Icon
          size={22}
          color={active ? scene.ochreLight : scene.cream}
          strokeWidth={active ? 2.6 : 2.2}
        />
        <Text role="caption" style={[s.label, active && s.labelActive]}>
          {t(label)}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={s.wrap} pointerEvents="box-none">
      <View style={[s.bar, { paddingBottom: insets.bottom, height: 64 + insets.bottom }]}>
        {FROSTED ? (
          <BlurView
            intensity={30}
            tint="dark"
            blurMethod="dimezisBlurView"
            style={s.barFill}
            pointerEvents="none"
          />
        ) : null}
        <Animated.View
          pointerEvents="none"
          style={[s.pill, { transform: [{ translateX: pill.x }] }]}
        />
        {left.map(Tab)}
        <Pressable
          onPress={() => (current === 'cart' ? undefined : router.push('/cart'))}
          style={s.cartSlot}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.cart')}
        >
          {({ pressed }) => (
            <Animated.View
              style={[
                s.cart,
                press.base,
                current === 'cart' && { backgroundColor: ui.brandDeep },
                pressed && press.down,
                { transform: [{ scale: pop }] },
              ]}
            >
              <Bag size={22} color={color.white} strokeWidth={2.2} />
              {count > 0 ? (
                <View style={s.badge}>
                  <Text role="caption" style={s.badgeText}>
                    {count}
                  </Text>
                </View>
              ) : null}
            </Animated.View>
          )}
        </Pressable>
        {right.map(Tab)}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: scene.glass,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: scene.glassEdge,
    paddingHorizontal: 8,
    height: 64,
  },
  barFill: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, height: 64 },
  label: { ...scale.caption, color: scene.cream },
  labelActive: { color: scene.ochreLight },
  // The chosen tab's rule: ochre, the accent — pomegranate is only ever a button.
  pill: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 28,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: scene.ochre,
  },
  cartSlot: { width: 72, alignItems: 'center', justifyContent: 'center' },
  cart: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: ui.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -22,
    ...shadow.paper,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: scene.ochre,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The cart disc's badge: ochre, ink numerals.
  badgeText: { ...scale.caption, color: scene.ink, fontVariant: ['tabular-nums'] },
});
