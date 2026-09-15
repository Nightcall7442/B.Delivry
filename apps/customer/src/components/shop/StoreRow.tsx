/** A stall on the home list: cover photo, name, rating and ETA, badges — one white card. */
import { storeTypeLabel, tagLabel, tr, type MapStoreDto } from '@bazar/storefront';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ui } from '@/components/ui/Page';
import { Basket, Chevron, Clock, Photo, Star, Text, color, press, useLocale } from '@bazar/mobile';

/** A paid spot on the home list, still running. */
export const promoted = (store: { promotedUntil: string | null }): boolean =>
  store.promotedUntil !== null && Date.parse(store.promotedUntil) > Date.now();

export function StoreRow({ store, etaMinutes }: { store: MapStoreDto; etaMinutes: number | null }) {
  const router = useRouter();
  const { locale, t } = useLocale();
  const tags = tagLabel(locale);
  const chips = [...store.tags.map((tag) => tags[tag])];

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/store/[storeId]', params: { storeId: store.id } })}
      style={({ pressed }) => [s.card, press.base, pressed && press.down]}
    >
      <Photo uri={store.coverUrl} style={s.photo} fallback={<Basket color={color.sand300} />} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text role="body" numberOfLines={1} style={{ fontWeight: '600', flexShrink: 1 }}>
            {tr(store.name, locale)}
          </Text>
          {!store.isOpen ? (
            <View style={s.closed}>
              <Text role="caption" style={{ fontSize: 10 }}>
                {t('store.closed')}
              </Text>
            </View>
          ) : promoted(store) ? (
            <View style={s.closed}>
              <Text role="caption" style={{ fontSize: 10 }}>
                {t('home.ad')}
              </Text>
            </View>
          ) : null}
        </View>
        <Text role="caption" numberOfLines={1}>
          {storeTypeLabel(locale)[store.type]}
          {chips.length ? ` · ${chips.join(' · ')}` : ''}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 }}>
          <View style={s.meta}>
            <Star size={13} color={color.saffron500} fill={color.saffron500} strokeWidth={2} />
            <Text role="caption" style={{ color: color.ink, fontWeight: '600' }}>
              {store.rating.toFixed(1)}
            </Text>
          </View>
          <View style={s.meta}>
            <Clock size={13} color={ui.brandDeep} strokeWidth={2.4} />
            <Text role="caption" style={{ color: color.ink, fontWeight: '600' }}>
              {etaMinutes
                ? t('common.minutes', { minutes: etaMinutes })
                : t('store.prep', { minutes: store.preparationMinutes })}
            </Text>
          </View>
        </View>
      </View>
      <Chevron size={20} color={color.inkFaint} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: ui.card,
    borderRadius: 20,
    padding: 10,
    ...ui.shadow,
  },
  photo: { width: 64, height: 64, borderRadius: 16, backgroundColor: color.sand100 },
  closed: {
    backgroundColor: color.sand100,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
