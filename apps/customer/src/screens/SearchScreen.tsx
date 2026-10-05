/**
 * Asking around the rows: one glass line to type into over the hall, the row
 * labels to narrow it down, and what was found as cardboard price signs
 * grouped by the stall that sells it — the person first, their signs under
 * them, the way you would walk it.
 */
import { arrivedToday, tr } from '@bazar/storefront';
import type { MapStoreDto } from '@bazar/storefront';
import type { MessageKey } from '@bazar/i18n';
import type { ProductDto } from '@bazar/types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CartDisc,
  Display,
  Eyebrow,
  Glass,
  RowSign,
  SHADOW_REACH,
  Say,
  Scene,
  SceneButton,
  ground,
  scene,
  sceneFont,
  useSceneTop,
} from '@/components/bazar';
import { ProductTile, TILE_GAP, useTileWidth } from '@/components/shop/ProductTile';
import { Bone, LoadError } from '@/components/ui/Page';
import { useCartCount } from '@/features/cart/store';
import { DEFAULT_POINT, useAddress } from '@/features/address/store';
import { listCategories, listProducts, listStores } from '@/lib/catalog';
import { useData, useList, useLoad } from '@/lib/use-data';
import { ArrowLeft, Photo, Search, noOutline, scale, useLocale } from '@bazar/mobile';

const TILTS = [-1.5, 1, -1, 1.5, -1, 1];

export function SearchScreen() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const insets = useSafeAreaInsets();
  const top = useSceneTop();
  const count = useCartCount();
  const {
    q = '',
    category,
    sort: sortParam,
  } = useLocalSearchParams<{ q?: string; category?: string; sort?: string }>();
  const [draft, setDraft] = useState(q);
  // «все скидки →» on the home opens the search sorted by the cut.
  const [sort, setSort] = useState<SortKey>(
    sortParam !== undefined && Object.hasOwn(SORTERS, sortParam)
      ? (sortParam as SortKey)
      : 'default',
  );

  const { address } = useAddress();
  const here = address?.point ?? DEFAULT_POINT;
  const stores = useData(() => listStores(here), [here.lat, here.lng]);
  const categories = useList(() => listCategories(), []);
  const productLoad = useLoad(
    () =>
      listProducts({
        ...(category ? { categoryId: category } : {}),
        ...(q ? { search: q } : {}),
      }),
    [q, category],
  );
  // Grouped by stall: the person first, their signs under them.
  const stalls = useMemo(() => {
    const sorted = [...(productLoad.data ?? [])].sort(SORTERS[sort]);
    const shown = sort === 'discount' ? sorted.filter((p) => p.oldPrice) : sorted;
    return (stores ?? [])
      .map((store) => ({
        store,
        items: shown.filter((p) => p.storeId === store.id && p.available),
      }))
      .filter((g) => g.items.length > 0);
  }, [stores, productLoad.data, sort]);

  const go = (next: { q?: string; category?: string | null }) => {
    const params: Record<string, string> = {};
    const nq = next.q ?? q;
    const nc = next.category === undefined ? category : next.category;
    if (nq) params['q'] = nq;
    if (nc) params['category'] = nc;
    router.setParams(params);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* The photograph of the rows hangs only at the door; the search stands in the hall. */}
      <Scene source={null} style={StyleSheet.absoluteFill}>
        {null}
      </Scene>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: top + 64, paddingBottom: 40 + insets.bottom }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: -SHADOW_REACH }}
          contentContainerStyle={s.rows}
        >
          <RowSign
            title={t('common.all')}
            tilt={-1}
            active={!category}
            onPress={() => go({ category: null })}
          />
          {categories.map((c, index) => (
            <RowSign
              key={c.id}
              title={tr(c.name, locale)}
              tilt={TILTS[index % TILTS.length] as number}
              active={category === c.id}
              onPress={() => go({ category: c.id })}
            />
          ))}
        </ScrollView>

        <View style={s.sorts}>
          {(Object.keys(SORTERS) as SortKey[]).map((key) => (
            <Pressable key={key} onPress={() => setSort(key)} hitSlop={14}>
              <Text style={[s.sort, sort === key && s.sortOn]}>
                {t(`sort.${key}` as MessageKey)}
              </Text>
            </Pressable>
          ))}
        </View>

        {productLoad.loading && !productLoad.data ? (
          <View style={{ paddingHorizontal: 20, gap: 12 }}>
            <Bone style={{ height: 30, width: 180 }} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Bone style={{ flex: 1, height: 120 }} />
              <Bone style={{ flex: 1, height: 120 }} />
            </View>
          </View>
        ) : productLoad.error && !productLoad.data ? (
          <View style={{ paddingHorizontal: 20 }}>
            <LoadError onRetry={() => void productLoad.reload()} />
          </View>
        ) : stalls.length === 0 ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 40, gap: 8 }}>
            <Display step="headline">{q ? `«${q}»` : t('common.all')}</Display>
            <Say color={scene.creamMuted}>{t('search.empty')}</Say>
          </View>
        ) : (
          stalls.map(({ store, items }) => (
            <StallGroup
              key={store.id}
              store={store}
              items={items}
              onOpen={() => router.push(`/store/${store.id}`)}
            />
          ))
        )}
      </ScrollView>

      <View style={[s.top, { top }]}>
        <SceneButton
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        >
          <ArrowLeft size={20} color={scene.ink} />
        </SceneButton>
        <Glass style={s.search}>
          <Search size={20} color={scene.ochreLight} />
          <TextInput
            placeholder={t('home.search')}
            placeholderTextColor={scene.creamMuted}
            value={draft}
            onChangeText={setDraft}
            returnKeyType="search"
            autoFocus={!q}
            onSubmitEditing={() => go({ q: draft })}
            style={s.input}
          />
        </Glass>
        <CartDisc count={count} onPress={() => router.push('/(tabs)/cart')} />
      </View>
    </View>
  );
}

function StallGroup({
  store,
  items,
  onOpen,
}: {
  store: MapStoreDto;
  items: ProductDto[];
  onOpen: () => void;
}) {
  const { locale, t } = useLocale();
  const tileWidth = useTileWidth();
  const person = store.ownerPhotoUrl ?? store.coverUrl;
  return (
    <View style={s.group}>
      <Pressable onPress={onOpen} style={s.person}>
        {person ? <Photo uri={person} style={s.avatar} /> : null}
        <View style={{ flex: 1, gap: 1 }}>
          <Display step="title" numberOfLines={1}>
            {store.ownerName ?? tr(store.name, locale)}
          </Display>
          <Eyebrow>
            {[store.standNumber ?? tr(store.name, locale), t.n('cart.items', items.length)]
              .filter(Boolean)
              .join(' · ')}
          </Eyebrow>
        </View>
      </Pressable>
      <View style={s.grid}>
        {items.map((product, i) => (
          <ProductTile key={product.id} product={product} index={i} style={{ width: tileWidth }} />
        ))}
      </View>
    </View>
  );
}

type SortKey = 'default' | 'cheap' | 'pricey' | 'discount';
const SORTERS: Record<SortKey, (a: ProductDto, b: ProductDto) => number> = {
  default: (a, b) => Number(arrivedToday(b)) - Number(arrivedToday(a)),
  cheap: (a, b) => a.price.amount - b.price.amount,
  pricey: (a, b) => b.price.amount - a.price.amount,
  discount: (a, b) => discountOf(b) - discountOf(a),
};
const discountOf = (p: ProductDto) => (p.oldPrice ? 1 - p.price.amount / p.oldPrice.amount : 0);

const s = StyleSheet.create({
  top: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 2,
  },
  search: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    fontFamily: sceneFont.uiText,
    ...scale.body,
    color: scene.cream,
    paddingVertical: 0,
    ...(noOutline as object),
  },
  // Room for the labels' shadow, handed back by the rail's negative margin.
  rows: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12 + SHADOW_REACH,
    gap: 8,
    alignItems: 'flex-end',
  },
  sorts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  sort: {
    fontFamily: sceneFont.uiText,
    ...scale.caption,
    color: scene.creamMuted,
    textShadowColor: ground(0.6),
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  sortOn: {
    fontFamily: sceneFont.uiHeavy,
    color: scene.ochreLight,
    textDecorationLine: 'underline',
  },
  group: { paddingHorizontal: 20, paddingTop: 22 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: scene.ochre,
    backgroundColor: scene.kraft,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP, rowGap: 18 },
});
