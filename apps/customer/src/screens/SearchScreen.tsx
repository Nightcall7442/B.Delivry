/**
 * Search across every stall: the search field in the header, category chips,
 * the same tiles as a store grouped by where the courier will pick them up.
 */
import { arrivedToday, tr } from '@bazar/storefront';
import type { MessageKey } from '@bazar/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ProductTile } from '@/components/shop/ProductTile';
import { Bone, Page, ui } from '@/components/ui/Page';
import { Chevron, Search, Chip, Text, color, noOutline, press, useLocale } from '@bazar/mobile';
import type { ProductDto } from '@bazar/types';

import { listCategories, listProducts, listStores } from '@/lib/catalog';
import { useData, useLoad } from '@/lib/use-data';

export function SearchScreen() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { q = '', category } = useLocalSearchParams<{ q?: string; category?: string }>();
  const [draft, setDraft] = useState(q);
  const [sort, setSort] = useState<SortKey>('default');

  const stores = useData(() => listStores(), []) ?? [];
  const categories = useData(() => listCategories(), []) ?? [];
  const productLoad = useLoad(
    () =>
      listProducts({
        ...(category ? { categoryId: category } : {}),
        ...(q ? { search: q } : {}),
      }),
    [q, category],
  );
  const products = productLoad.data ?? [];

  const groups = useMemo(() => {
    const sorted = [...products].sort(SORTERS[sort]);
    const shown = sort === 'discount' ? sorted.filter((p) => p.oldPrice) : sorted;
    return stores
      .map((store) => ({ store, items: shown.filter((p) => p.storeId === store.id) }))
      .filter((g) => g.items.length > 0);
  }, [stores, products, sort]);

  const go = (next: { q?: string; category?: string | null }) => {
    const params: Record<string, string> = {};
    const nq = next.q ?? q;
    const nc = next.category === undefined ? category : next.category;
    if (nq) params['q'] = nq;
    if (nc) params['category'] = nc;
    router.setParams(params);
  };

  return (
    <Page
      back="/"
      cart
      header={
        <View style={s.search}>
          <Search size={20} color={color.inkFaint} />
          <TextInput
            placeholder={t('home.search')}
            placeholderTextColor={color.inkFaint}
            value={draft}
            onChangeText={setDraft}
            returnKeyType="search"
            autoFocus={!q}
            onSubmitEditing={() => go({ q: draft })}
            style={s.input}
          />
        </View>
      }
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.chips}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 4 }}
      >
        <Chip label={t('common.all')} active={!category} onPress={() => go({ category: null })} />
        {categories.map((c) => (
          <Chip
            key={c.id}
            label={tr(c.name, locale)}
            active={category === c.id}
            onPress={() => go({ category: c.id })}
          />
        ))}
      </ScrollView>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[s.chips, { marginTop: 8 }]}
        contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}
      >
        {(Object.keys(SORTERS) as SortKey[]).map((key) => (
          <Pressable
            key={key}
            onPress={() => setSort(key)}
            style={({ pressed }) => [
              s.sort,
              press.base,
              sort === key && s.sortOn,
              pressed && press.down,
            ]}
          >
            <Text
              role="caption"
              style={{ fontWeight: '600', color: sort === key ? ui.brandDeep : color.inkMuted }}
            >
              {t(`sort.${key}` as MessageKey)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {productLoad.loading && !productLoad.data ? (
        <View style={{ marginTop: 18, gap: 12 }}>
          <Bone style={{ height: 24, width: '60%' }} />
          {[0, 1].map((row) => (
            <View key={row} style={{ flexDirection: 'row', gap: 12 }}>
              <Bone style={{ flex: 1, height: 250 }} />
              <Bone style={{ flex: 1, height: 250 }} />
            </View>
          ))}
        </View>
      ) : groups.length === 0 ? (
        <Text role="muted" style={{ textAlign: 'center', paddingVertical: 40 }}>
          {t('search.empty')}
        </Text>
      ) : (
        groups.map(({ store, items }) => (
          <View key={store.id} style={{ marginTop: 18 }}>
            <Pressable
              onPress={() =>
                router.push({ pathname: '/store/[storeId]', params: { storeId: store.id } })
              }
              style={s.groupHead}
            >
              <Text role="section">{tr(store.name, locale)}</Text>
              <Chevron size={20} color={color.inkFaint} />
            </Pressable>
            <View style={{ marginTop: 10, gap: 12 }}>
              {pairs(items).map((pair) => (
                <View key={pair[0]?.id} style={{ flexDirection: 'row', gap: 12 }}>
                  {pair.map((product) => (
                    <ProductTile key={product.id} product={product} />
                  ))}
                  {pair.length === 1 ? <View style={{ flex: 1 }} /> : null}
                </View>
              ))}
            </View>
          </View>
        ))
      )}
    </Page>
  );
}

type SortKey = 'default' | 'cheap' | 'pricey' | 'discount' | 'fresh';
const SORTERS: Record<SortKey, (a: ProductDto, b: ProductDto) => number> = {
  default: (a, b) => Number(arrivedToday(b)) - Number(arrivedToday(a)),
  cheap: (a, b) => a.price.amount - b.price.amount,
  pricey: (a, b) => b.price.amount - a.price.amount,
  discount: (a, b) => discountOf(b) - discountOf(a),
  fresh: (a, b) => Number(arrivedToday(b)) - Number(arrivedToday(a)),
};
const discountOf = (p: ProductDto) => (p.oldPrice ? 1 - p.price.amount / p.oldPrice.amount : 0);

function pairs<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
  return out;
}

const s = StyleSheet.create({
  search: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    backgroundColor: color.field,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: { flex: 1, fontSize: 16, color: color.ink, paddingVertical: 0, ...noOutline },
  chips: { marginHorizontal: -16, marginTop: 4 },
  sort: {
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: color.field,
  },
  sortOn: { backgroundColor: ui.brandSoft },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
});
