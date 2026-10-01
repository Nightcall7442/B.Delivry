/**
 * The bottom bar: orders, goods, the stall. Paper on the hall, the one pomegranate dot on Orders
 * counting what waits for an answer.
 */
// SDK 57: expo-router's <Tabs> ships its own bottom-tabs types; the prop type must come from there.
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs/types';
import { useRouter } from 'expo-router';
import type { ComponentType } from 'react';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Basket, Home, Receipt, press, radius, shadow } from '@bazar/mobile';
import { HALL, TONE, alpha } from '@bazar/storefront';

import { sceneFont } from '@/components/scene';
import { useVendor } from '@/features/vendor';

type IconComponent = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const TABS: ReadonlyArray<{ name: string; icon: IconComponent; label: string }> = [
  { name: 'index', icon: Receipt, label: 'Заказы' },
  { name: 'products', icon: Basket, label: 'Товары' },
  { name: 'store', icon: Home, label: 'Прилавок' },
];

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { waiting } = useVendor();
  const current = state.routes[state.index]?.name;

  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {TABS.map((tab) => {
        const active = current === tab.name;
        const Icon = tab.icon;
        return (
          <Pressable
            key={tab.name}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
            onPress={() =>
              active
                ? router.navigate(tab.name === 'index' ? '/' : (`/${tab.name}` as never))
                : navigation.navigate(tab.name)
            }
            style={({ pressed }) => [s.tab, press.base, pressed && press.down]}
          >
            <View>
              <Icon size={24} color={active ? TONE.pomegranateLit : TONE.inkSoft} />
              {tab.name === 'index' && waiting > 0 ? (
                <View style={s.dot}>
                  <RNText style={s.dotText}>{waiting > 9 ? '9+' : waiting}</RNText>
                </View>
              ) : null}
            </View>
            <RNText style={[s.label, active && { color: HALL.ink }]}>{tab.label}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: HALL.cream,
    borderTopLeftRadius: radius.paper,
    borderTopRightRadius: radius.paper,
    borderTopWidth: 1,
    borderColor: alpha(TONE.paperEdge, 0.4),
    paddingTop: 8,
    ...shadow.paper,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4 },
  label: { fontFamily: sceneFont.ui, fontSize: 12, color: TONE.inkSoft },
  dot: {
    position: 'absolute',
    top: -6,
    right: -12,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: HALL.pomegranate,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotText: { fontFamily: sceneFont.heavy, fontSize: 11, color: HALL.cream },
});
