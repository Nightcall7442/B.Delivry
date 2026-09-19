/**
 * Asking around the rows: one frosted line to type into over the bazaar
 * photograph, the row signs to narrow it down, and what was found as
 * cardboard price signs grouped by the stall that sells it — the person
 * first, their signs under them, the way you would walk it.
 */
import { arrivedToday, tr, unitLabel } from '@bazar/storefront';
import type { MapStoreDto } from '@bazar/storefront';
import type { MessageKey } from '@bazar/i18n';
import type { ProductDto } from '@bazar/types';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CartDisc,
  Display,
  Eyebrow,
  Glass,
  Hand,
  RowSign,
  SCENES,
  Scene,
  SceneButton,
  Sign,
  isEvening,
  scene,
  sceneFont,
  useSceneTop,
} from '@/components/bazar';
import { Bone, LoadError } from '@/components/ui/Page';
import { useCart, useCartActions, useCartCount } from '@/features/cart/store';
import { listCategories, listProducts, listStores } from '@/lib/catalog';
import { useData, useList, useLoad } from '@/lib/use-data';
import { ArrowLeft, Search, noOutline, useLocale } from '@bazar/mobile';

const TILTS = [-1.5, 1, -1, 1.5, -1, 1];

export function SearchScreen() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const insets = useSafeAreaInsets();
  const top = useSceneTop();
  const evening = isEvening();
  const count = useCartCount();
  const { q = '', category } = useLocalSearchParams<{ q?: string; category?: string }>();
  const [draft, setDraft] = useState(q);
  const [sort, setSort] = useState<SortKey>('default');

  const stores = useData(() => listStores(), []);
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
    <View style={{ flex: 1, backgroundColor: scene.night }}>
      <Scene
        source={evening ? SCENES.evening : SCENES.morning}
        evening={evening}
        style={StyleSheet.absoluteFill}
      >
        <View />
      </Scene>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: top + 64, paddingBottom: 40 + insets.bottom }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
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
            <Pressable key={key} onPress={() => setSort(key)} hitSlop={6}>
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
            <Display size={30}>{q ? `«${q}»` : t('common.all')}</Display>
            <Hand size={24} color={scene.creamMuted}>
              {t('search.empty')}
            </Hand>
          </View>
        ) : (
          stalls.map(({ store, items }) => (
            <StallGroup
              key={store.id}
              store={store}
              items={items}
              onOpen={() => router.push(`/store/${store.id}`)}
              onProduct={(id) => router.push(`/product/${id}`)}
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
          <Search size={20} color={scene.saffron} />
          <TextInput
            placeholder={t('home.search')}
            placeholderTextColor={scene.creamDim}
            value={draft}
            onChangeText={setDraft}
            returnKeyType="search"
            autoFocus={!q}
            onSubmitEditing={() => go({ q: draft })}
            style={s.input}
          />
        </Glass>
        <CartDisc count={count} evening={evening} onPress={() => router.push('/(tabs)/cart')} />
      </View>
    </View>
  );
}

function StallGroup({
  store,
  items,
  onOpen,
  onProduct,
}: {
  store: MapStoreDto;
  items: ProductDto[];
  onOpen: () => void;
  onProduct: (productId: string) => void;
}) {
  const { locale, t } = useLocale();
  const { quantities } = useCart();
  const { setQuantity } = useCartActions();
  const units = unitLabel(locale);
  const person = store.ownerPhotoUrl ?? store.coverUrl;
  return (
    <View style={s.group}>
      <Pressable onPress={onOpen} style={s.person}>
        {person ? (
          <Image
            source={{ uri: person }}
            style={s.avatar}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : null}
        <View style={{ flex: 1, gap: 1 }}>
          <Display size={24} numberOfLines={1}>
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
        {items.map((product, i) => {
          const qty = quantities[product.id] ?? 0;
          return (
            <Sign
              key={product.id}
              style={s.sign}
              tilt={[-1, 1, 0.5, -0.5][i % 4] ?? 0}
              title={tr(product.name, locale)}
              price={`${t.money(product.price.amount, product.price.currency)} / ${units[product.unit]}`}
              note={arrivedToday(product) ? t('store.arrivedToday') : undefined}
              count={qty}
              countLabel={t('scene.inCart', { count: `${t.qty(qty)} ${units[product.unit]}` })}
              onPress={() => onProduct(product.id)}
              onAdd={() =>
                setQuantity(
                  product.id,
                  qty === 0
                    ? product.minQuantity || product.quantityStep || 1
                    : qty + (product.quantityStep || 1),
                )
              }
            />
          );
        })}
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
    fontSize: 15,
    color: scene.cream,
    paddingVertical: 0,
    ...(noOutline as object),
  },
  rows: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 8, alignItems: 'flex-end' },
  sorts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  sort: {
    fontFamily: sceneFont.uiText,
    fontSize: 12,
    color: scene.creamMuted,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  sortOn: {
    fontFamily: sceneFont.uiHeavy,
    color: scene.saffronLight,
    textDecorationLine: 'underline',
  },
  group: { paddingHorizontal: 20, paddingTop: 22 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: scene.saffron,
    backgroundColor: '#3A2A1A',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, rowGap: 14 },
  sign: { width: '47%', flexGrow: 1 },
});
