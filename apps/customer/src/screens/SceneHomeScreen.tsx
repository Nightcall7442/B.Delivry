/**
 * The front door as a walk into the bazaar: one photograph of the rows fills
 * the screen, the greeting sits on it, then the people who are at their
 * counters right now, then the rows to walk along. Morning and evening are the
 * same screen in different light. No tab bar — the row is the navigation,
 * the cart is a disc, the profile is the initial in the corner.
 */
import { tr } from '@bazar/storefront';
import type { CategoryDto } from '@bazar/types';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CartDisc,
  Display,
  Eyebrow,
  Glass,
  KraftTag,
  RowSign,
  Scene,
  SceneButton,
  SceneHead,
  VendorCard,
  scene,
  sceneFont,
  useSceneTop,
} from '@/components/bazar';
import { LoadError } from '@/components/ui/Page';
import { useCartCount } from '@/features/cart/store';
import { listCategories, listStores } from '@/lib/catalog';
import { useLoad } from '@/lib/use-data';
import { Bell, Mic, useAuth, useLocale } from '@bazar/mobile';

const MORNING = require('../../assets/scenes/morning.jpg');
const EVENING = require('../../assets/scenes/evening.jpg');

/** Tashkent hour: the bazaar lives on its own clock, not the phone's. */
function tashkentHour(now = new Date()): number {
  return (now.getUTCHours() + 5) % 24;
}

const isEvening = (hour: number) => hour >= 17 || hour < 5;
const TILTS = [-1.5, 1, -1, 1.5, -1, 1];

export function SceneHomeScreen() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const top = useSceneTop();
  const count = useCartCount();
  const storeLoad = useLoad(() => listStores(), []);
  const categoryLoad = useLoad(() => listCategories(), []);
  const evening = isEvening(tashkentHour());

  const stores = storeLoad.data ?? [];
  const categories = categoryLoad.data ?? [];
  // People first: a stall with a named owner is a person, a supermarket is a building.
  const vendors = useMemo(
    () =>
      [...stores]
        .filter((s) => s.isOpen || !evening)
        .sort((a, b) => Number(!!b.ownerName) - Number(!!a.ownerName)),
    [stores, evening],
  );
  const dateLine = new Intl.DateTimeFormat(locale === 'uz' ? 'uz-Latn-UZ' : 'ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Tashkent',
  }).format(new Date());
  const failed = !storeLoad.data && storeLoad.error;

  return (
    <Scene source={evening ? EVENING : MORNING} evening={evening}>
      <View style={[s.top, { top }]}>
        <KraftTag>{evening ? 'Чорсу · вечер · до 21:00' : 'Чорсу · утро · +18°'}</KraftTag>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <SceneButton onPress={() => router.push('/(tabs)/orders')}>
            <Bell size={20} color={scene.pomegranate} />
          </SceneButton>
          <SceneButton onPress={() => router.push('/(tabs)/profile')}>
            <Text style={s.initial}>{(user?.firstName ?? 'А').slice(0, 1).toUpperCase()}</Text>
          </SceneButton>
        </View>
      </View>

      <View style={[s.greeting, { top: top + 50 }]}>
        <Eyebrow>
          {capitalize(dateLine)} · {t(evening ? 'scene.eveningLine' : 'scene.morningLine')}
        </Eyebrow>
        <Display size={46} italic={evening}>
          {t(evening ? 'scene.evening' : 'scene.morning')}
          {user?.firstName ? `,\n${user.firstName}` : ''}
        </Display>
      </View>

      <View style={[s.lower, { bottom: 100 + insets.bottom }]}>
        {failed ? (
          <View style={{ paddingHorizontal: 20 }}>
            <LoadError onRetry={() => void storeLoad.reload()} />
          </View>
        ) : null}
        <SceneHead
          title={t('scene.vendorsHere')}
          action={t('scene.vendorsAll', { count: stores.length })}
          onAction={() => router.push('/(tabs)/categories')}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.vendors}
        >
          {vendors.map((store) => (
            <VendorCard
              key={store.id}
              photo={store.ownerPhotoUrl ?? store.counterPhotoUrl ?? store.coverUrl}
              name={store.ownerName ?? tr(store.name, locale)}
              line={store.ownerMotto ? shortLine(tr(store.ownerMotto, locale)) : null}
              onPress={() => router.push(`/store/${store.id}`)}
            />
          ))}
        </ScrollView>

        <SceneHead
          title={t('scene.walkRow')}
          action={t('scene.rowsAll')}
          onAction={() => router.push('/(tabs)/categories')}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rows}>
          {categories.slice(0, 6).map((category: CategoryDto, index) => (
            <RowSign
              key={category.id}
              title={tr(category.name, locale)}
              tilt={TILTS[index % TILTS.length] as number}
              onPress={() => router.push({ pathname: '/ryad/[categoryId]', params: { categoryId: category.id } })}
            />
          ))}
        </ScrollView>
      </View>

      <View style={[s.rule, { bottom: 92 + insets.bottom }]} />
      <View style={[s.bottom, { bottom: 24 + insets.bottom }]}>
        <Glass style={s.voice} onPress={() => router.push('/list')}>
          <Mic size={22} color={evening ? '#F2A93B' : scene.saffron} />
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={s.voiceTitle}>{t(evening ? 'scene.sayEvening' : 'scene.say')}</Text>
            <Text style={s.voiceHint} numberOfLines={1}>
              {t('scene.sayHint')}
            </Text>
          </View>
        </Glass>
        <CartDisc count={count} evening={evening} onPress={() => router.push('/(tabs)/cart')} />
      </View>
    </Scene>
  );
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The motto is a sentence; the card has room for four words of it. */
function shortLine(text: string): string {
  const words = text.replace(/[.!…]+$/, '').split(' ');
  return words.length <= 4 ? words.join(' ') : `${words.slice(0, 4).join(' ')}…`;
}

const s = StyleSheet.create({
  top: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 2,
  },
  initial: { fontFamily: sceneFont.display, fontSize: 20, color: scene.pomegranate },
  greeting: { position: 'absolute', left: 20, right: 20, gap: 6 },
  lower: { position: 'absolute', left: 0, right: 0, gap: 10 },
  vendors: { paddingHorizontal: 20, gap: 10 },
  rows: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 4, gap: 8, alignItems: 'flex-end' },
  rule: { position: 'absolute', left: 20, right: 20, height: 1, backgroundColor: 'rgba(251,241,222,0.18)' },
  bottom: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  voice: { flex: 1, height: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  voiceTitle: { fontFamily: sceneFont.italic, fontSize: 17, color: scene.cream },
  voiceHint: { fontFamily: sceneFont.uiText, fontSize: 11, color: scene.creamDim },
});
