/**
 * The catalogue as a plan of the bazaar drawn on kraft: you come in at the
 * top and walk down the aisle, counters on both sides. Each counter is a row
 * (a category) with its cardboard sign, the faces of the people selling
 * there and how much is on the counter today. Tap a counter to walk that row.
 */
import type { CategoryDto, StoreDto } from '@bazar/types';
import { tr } from '@bazar/storefront';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';

import { sceneFont } from '@/components/bazar';
import { Bone, Page } from '@/components/ui/Page';
import { listCategories, listProducts, listStores } from '@/lib/catalog';
import { useData } from '@/lib/use-data';
import { color, isDark, press, useLocale } from '@bazar/mobile';

const KRAFT = isDark ? '#2A2014' : '#EAD8B2';
const PAPER = isDark ? '#1E1408' : '#F4EFE4';
const SIGN = isDark ? '#3A2E1C' : '#FBF5E6';
const SIGN_EDGE = isDark ? '#5A4A2E' : '#C9B99A';

export function CategoriesScreen() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const categories = useData(() => listCategories(), []);
  const stores = useData(() => listStores(), []);
  const products = useData(() => listProducts(), []);

  // Per row: what is on the counters today and who is standing behind them.
  const rows = useMemo(() => {
    const byCategory = new Map<string, { count: number; storeIds: Set<string> }>();
    for (const product of products ?? []) {
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
        <Bone style={{ height: 560, borderRadius: 6, marginTop: 8 }} />
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
          <View style={s.pin} />
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
                    {photo ? (
                      <Image
                        source={{ uri: photo }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    ) : null}
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

const s = StyleSheet.create({
  sheet: {
    marginTop: 8,
    marginBottom: 8,
    backgroundColor: KRAFT,
    borderRadius: 6,
    padding: 14,
    paddingTop: 12,
    transform: [{ rotate: '-0.4deg' }],
    shadowColor: '#3A2A1A',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  eyebrow: {
    fontFamily: sceneFont.uiHeavy,
    fontSize: 10,
    letterSpacing: 1.2,
    color: color.inkMuted,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  gate: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, marginBottom: 6 },
  gateLine: {
    flex: 1,
    height: 0,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: color.ink,
    opacity: 0.35,
  },
  gateText: { fontFamily: sceneFont.hand, fontSize: 20, color: color.ink },
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
    fontFamily: sceneFont.hand,
    fontSize: 16,
    color: color.ink,
    opacity: 0.45,
    backgroundColor: KRAFT,
    paddingVertical: 2,
  },
  counterGhost: { flex: 1 },
  counter: {
    flex: 1,
    minWidth: 0,
    backgroundColor: PAPER,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.ink,
    borderRadius: 4,
    padding: 10,
    paddingTop: 14,
    gap: 8,
    minHeight: 112,
  },
  sign: {
    alignSelf: 'flex-start',
    flexShrink: 1,
    backgroundColor: SIGN,
    borderWidth: 1,
    borderColor: SIGN_EDGE,
    paddingVertical: 3,
    paddingHorizontal: 9,
    marginTop: -20,
    maxWidth: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
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
  signText: {
    fontFamily: sceneFont.hand,
    fontSize: 16,
    lineHeight: 18,
    color: color.ink,
    textTransform: 'uppercase',
  },
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
  faceInitial: { fontFamily: sceneFont.display, fontSize: 13, color: color.ink },
  names: { flex: 1, fontFamily: sceneFont.uiText, fontSize: 11, color: color.inkMuted },
  count: { marginTop: 'auto', fontFamily: sceneFont.uiHeavy, fontSize: 11, color: color.brand500 },
  empty: { fontFamily: sceneFont.hand, fontSize: 17, color: color.inkMuted },
  dome: {
    fontFamily: sceneFont.hand,
    fontSize: 18,
    color: color.inkMuted,
    textAlign: 'center',
    marginTop: 10,
  },
});
