/**
 * The catalogue as a plan of the bazaar drawn on kraft: you come in at the
 * top and walk down the aisle, counters on both sides. Each counter is a row
 * (a category) with its cardboard sign, the faces of the people selling
 * there and how much is on the counter today. Tap a counter to walk that row.
 */
import type { CategoryDto, StoreDto } from '@bazar/types';
import { closesToday, shopfronts, stallGoods, tr } from '@bazar/storefront';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';

import { Display, SHADOW_REACH, ShopSign, caps, sceneFont } from '@/components/bazar';
import { Bone, Page } from '@/components/ui/Page';
import { useAddress } from '@/features/address/store';
import { listCategories, listProducts, listStores } from '@/lib/catalog';
import { EMPTY, useData } from '@/lib/use-data';
import { Photo, color, press, radius, scale, shadow, useLocale } from '@bazar/mobile';

export function CategoriesScreen() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { address } = useAddress();
  const categories = useData(() => listCategories(), []);
  const stores = useData(() => listStores(), []);
  const products = useData(() => listProducts(), []);
  // The shops stand outside the gate: one board per chain, nearest branch first.
  const shops = useMemo(
    () => shopfronts(stores ?? EMPTY, address?.point ?? null),
    [stores, address],
  );

  // Per row: what is on the counters today and who is standing behind them.
  // Shop shelves are not rows of the bazaar; they wait behind their boards below.
  const rows = useMemo(() => {
    const byCategory = new Map<string, { count: number; storeIds: Set<string> }>();
    for (const product of stallGoods(products ?? EMPTY, stores ?? EMPTY)) {
      if (!product.categoryId || !product.available) continue;
      const row = byCategory.get(product.categoryId) ?? { count: 0, storeIds: new Set<string>() };
      row.count += 1;
      row.storeIds.add(product.storeId);
      byCategory.set(product.categoryId, row);
    }
    return (categories ?? []).map((category) => {
      const row = byCategory.get(category.id);
      const stalls = (stores ?? []).filter((store) => row?.storeIds.has(store.id));
      return { category, count: row?.count ?? 0, stalls };
    });
  }, [categories, stores, products]);
  const stallCount = new Set(rows.flatMap((row) => row.stalls.map((s) => s.id))).size;
  // Counters face each other across the aisle: two per row, walking down.
  const pairs = rows.flatMap((row, i) => (i % 2 === 0 ? [[row, rows[i + 1]] as const] : []));
  const loading = !categories || !stores || !products;

  return (
    <Page tabs title={t('map.title')} cart>
      {loading ? (
        <Bone style={{ height: 560, marginTop: 8 }} />
      ) : (
        <View style={s.sheet}>
          <RNText style={s.eyebrow}>
            {t.n('map.rows', rows.length)} · {t.n('map.stalls', stallCount)}
          </RNText>

          <View style={s.gate}>
            <View style={s.gateLine} />
            <RNText style={s.gateText}>{t('map.entrance')}</RNText>
            <View style={s.gateLine} />
          </View>

          <View style={s.hall}>
            <View style={s.aisleLine} />
            {pairs.map(([left, right]) => (
              <View key={left.category.id} style={s.pair}>
                {counter(left, -0.6)}
                <RNText style={s.step}>↓</RNText>
                {right ? counter(right, 0.6) : <View style={s.counterGhost} />}
              </View>
            ))}
          </View>

          <RNText style={s.dome}>{t('map.dome')}</RNText>
        </View>
      )}
      {shops.length > 0 ? (
        <>
          <Display step="title" style={s.shopsHead}>
            {t('shop.nearby')}
          </Display>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.shops}
            style={{ marginHorizontal: -16, marginBottom: -SHADOW_REACH }}
          >
            {shops.map((store) => {
              const closes = closesToday(store);
              return (
                <ShopSign
                  key={store.id}
                  name={tr(store.name, locale)}
                  logo={store.logoUrl}
                  line={closes ? t('shop.until', { time: closes }) : t('shop.closedToday')}
                  onPress={() => router.push(`/store/${store.id}`)}
                />
              );
            })}
          </ScrollView>
        </>
      ) : null}
    </Page>
  );

  function counter(
    { category, count, stalls }: { category: CategoryDto; count: number; stalls: StoreDto[] },
    tilt: number,
  ) {
    const empty = count === 0;
    const names = stalls.map((store) => store.ownerName ?? tr(store.name, locale));
    return (
      <Pressable
        key={category.id}
        disabled={empty}
        onPress={() =>
          router.push({ pathname: '/ryad/[categoryId]', params: { categoryId: category.id } })
        }
        style={({ pressed }) => [
          s.counter,
          empty && { opacity: 0.55 },
          press.base,
          pressed && press.down,
        ]}
      >
        <View style={[s.sign, { transform: [{ rotate: `${tilt}deg` }] }]}>
          <RNText style={s.signText} numberOfLines={2}>
            {tr(category.name, locale)}
          </RNText>
        </View>
        {empty ? (
          <RNText style={s.empty}>{t('map.empty')}</RNText>
        ) : (
          <>
            <View style={s.faces}>
              {stalls.slice(0, 4).map((store, i) => {
                const photo = store.ownerPhotoUrl ?? store.coverUrl;
                return (
                  <View key={store.id} style={[s.face, i > 0 && { marginLeft: -8 }]}>
                    <RNText style={s.faceInitial}>{names[i]?.slice(0, 1)}</RNText>
                    {photo ? <Photo uri={photo} style={s.facePhoto} /> : null}
                  </View>
                );
              })}
              <RNText style={s.names} numberOfLines={1}>
                {names.join(' · ')}
              </RNText>
            </View>
            <RNText style={s.count}>{t.n('categories.items', count)} →</RNText>
          </>
        )}
      </Pressable>
    );
  }
}

// The plan is kraft, the counters on it paper, the row labels kraft again — all in the theme's own
// tones (lapis in the dark theme), because the type on them is theme-coloured.
const s = StyleSheet.create({
  sheet: {
    marginTop: 8,
    marginBottom: 8,
    backgroundColor: color.field,
    borderRadius: radius.paper,
    padding: 14,
    paddingTop: 12,
    transform: [{ rotate: '-0.4deg' }],
    ...shadow.paper,
  },
  eyebrow: { ...caps, color: color.inkMuted, textAlign: 'center' },
  gate: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, marginBottom: 6 },
  gateLine: {
    flex: 1,
    height: 0,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: color.ink,
    opacity: 0.35,
  },
  gateText: { ...caps, color: color.ink },
  hall: { gap: 12, paddingVertical: 6 },
  pair: { flexDirection: 'row', alignItems: 'stretch', gap: 6 },
  aisleLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 0,
    borderLeftWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.ink,
    opacity: 0.3,
  },
  step: {
    alignSelf: 'center',
    fontFamily: sceneFont.uiHeavy,
    ...scale.caption,
    color: color.ink,
    opacity: 0.45,
    backgroundColor: color.field,
    paddingVertical: 2,
  },
  counterGhost: { flex: 1 },
  counter: {
    flex: 1,
    minWidth: 0,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.ink,
    borderRadius: radius.paper,
    padding: 10,
    paddingTop: 14,
    gap: 8,
    minHeight: 112,
  },
  // The row's label: kraft on the counter's paper, flat, no pin — pins are for price signs.
  sign: {
    alignSelf: 'flex-start',
    flexShrink: 1,
    backgroundColor: color.field,
    borderWidth: 1,
    borderColor: color.lineStrong,
    borderRadius: radius.paper,
    paddingVertical: 3,
    paddingHorizontal: 9,
    marginTop: -20,
    maxWidth: '100%',
  },
  signText: { ...caps, color: color.ink },
  faces: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  face: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: color.saffron500,
    backgroundColor: color.field,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  facePhoto: { ...StyleSheet.absoluteFill, borderRadius: 0 },
  faceInitial: { fontFamily: sceneFont.display, ...scale.caption, color: color.ink },
  names: { flex: 1, fontFamily: sceneFont.uiText, ...scale.caption, color: color.inkMuted },
  count: {
    marginTop: 'auto',
    fontFamily: sceneFont.uiHeavy,
    ...scale.caption,
    color: color.brand500,
    fontVariant: ['tabular-nums'],
  },
  empty: { fontFamily: sceneFont.uiText, ...scale.body, color: color.inkMuted },
  dome: { ...caps, color: color.inkMuted, textAlign: 'center', marginTop: 10 },
  shopsHead: { marginTop: 12, marginBottom: 8 },
  // Room for the boards' shadow, handed back by the rail's negative margin.
  shops: { paddingHorizontal: 16, paddingBottom: 16 + SHADOW_REACH, gap: 10 },
});
