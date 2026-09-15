/**
 * The bottom bar of the redesign: four tabs and the cart as a green disc in
 * the middle with the item count. Floats over the page ground with a shadow.
 */
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useEffect, useRef, type ComponentType } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
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
  shadow,
  useLocale,
} from '@bazar/mobile';
import type { MessageKey } from '@bazar/i18n';

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
  // Something landed in the cart: the disc pops once.
  const pop = useRef(new Animated.Value(1)).current;
  const previous = useRef(count);
  useEffect(() => {
    if (count > previous.current) {
      pop.setValue(1);
      Animated.sequence([
        Animated.spring(pop, { toValue: 1.18, useNativeDriver: true, speed: 60, bounciness: 8 }),
        Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 10 }),
      ]).start();
    }
    previous.current = count;
  }, [count, pop]);
  const go = (name: string) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!event.defaultPrevented) navigation.navigate(name);
  };
  const [left, right] = [TABS.slice(0, 2), TABS.slice(2)];
  // The green pill slides to the active tab: layouts are measured once, the position springs.
  const slots = useRef<Record<string, { x: number; width: number }>>({});
  const pill = useRef(new Animated.ValueXY({ x: -100, y: 0 })).current;
  const pillWidth = useRef(new Animated.Value(0)).current;
  const moveTo = (name: string | undefined) => {
    const slot = name ? slots.current[name] : undefined;
    if (!slot) return;
    Animated.parallel([
      Animated.spring(pill, {
        toValue: { x: slot.x + slot.width / 2 - 14, y: 0 },
        useNativeDriver: true,
        speed: 18,
        bounciness: 6,
      }),
      Animated.timing(pillWidth, { toValue: 28, duration: 200, useNativeDriver: false }),
    ]).start();
  };
  useEffect(() => {
    moveTo(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);
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
        <Icon size={22} color={active ? ui.brand : color.inkMuted} strokeWidth={active ? 2.4 : 2} />
        <Text role="caption" style={{ color: active ? ui.brand : color.inkMuted, fontSize: 11 }}>
          {t(label)}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={s.wrap} pointerEvents="box-none">
      <View style={[s.bar, { paddingBottom: insets.bottom, height: 64 + insets.bottom }]}>
        <BlurView
          intensity={30}
          tint={color.blurTint}
          experimentalBlurMethod="dimezisBlurView"
          style={s.barFill}
          pointerEvents="none"
        />
        <Animated.View
          pointerEvents="none"
          style={[s.pill, { width: pillWidth, transform: [{ translateX: pill.x }] }]}
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
                  <Text role="caption" style={{ color: color.white, fontSize: 10, lineHeight: 12 }}>
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
    backgroundColor: color.glass,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
    paddingHorizontal: 8,
    height: 64,
  },
  barFill: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, height: 64 },
  pill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: ui.brand,
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
    ...shadow.glow,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: color.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
