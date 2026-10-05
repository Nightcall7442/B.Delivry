/**
 * The stall's shelf: every good with its price and what is left, a search, and the switch that puts
 * a good on or off sale — the thing a seller does a dozen times between six and noon. Sold-out goods
 * stay on the list (under the ones that can be bought), so they can be switched on again.
 */
import { Field, Search, color, scale } from '@bazar/mobile';
import { HALL, TONE, searchStallProducts, tr, type StallProduct } from '@bazar/storefront';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Bone, Empty, LoadError, NoStall } from '@/components/goods/feedback';
import { EditSheet } from '@/components/goods/EditSheet';
import { ProductRow } from '@/components/goods/ProductRow';
import { useGoods } from '@/components/goods/use-goods';
import { Ground, Paper, sceneFont } from '@/components/scene';
import { useVendor } from '@/features/vendor';

/** The tab bar the list must clear. */
const TAB_BAR = 64;

export function ProductsScreen() {
  const insets = useSafeAreaInsets();
  const { ready, store } = useVendor();
  const goods = useGoods(store?.id ?? null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<StallProduct | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Another stall, another shelf: what was typed about the first one means nothing on it.
  const storeId = store?.id;
  useEffect(() => setQuery(''), [storeId]);

  const { items } = goods;
  const shown = useMemo(() => (items ? searchStallProducts(items, query) : []), [items, query]);
  const onSale = items ? items.filter((item) => item.available).length : 0;
  const searching = query.trim() !== '';

  const refresh = () => {
    setRefreshing(true);
    void goods.reload().then(() => setRefreshing(false));
  };

  const empty = !ready ? (
    <Skeleton />
  ) : !store ? (
    <NoStall />
  ) : items === null ? (
    goods.failed ? (
      <LoadError text="Не удалось загрузить товары" onRetry={() => void goods.reload()} />
    ) : (
      <Skeleton />
    )
  ) : searching ? (
    <Empty
      title="Ничего не нашлось"
      text={`По запросу «${query.trim()}» на вашем прилавке пусто.`}
    />
  ) : (
    <Empty
      title="Товаров пока нет"
      text="Новые товары добавляются в кабинете продавца на сайте. Когда они появятся, здесь можно будет менять цену, остаток и наличие."
    />
  );

  return (
    <Ground>
      <View style={[s.head, { paddingTop: insets.top + 12 }]}>
        <RNText style={s.title} accessibilityRole="header">
          Товары
        </RNText>
        {store ? (
          <RNText style={s.stall} numberOfLines={1}>
            {tr(store.name, 'ru')}
          </RNText>
        ) : null}
        {items && items.length > 0 ? (
          <>
            <Field
              value={query}
              onChangeText={setQuery}
              placeholder="Найти товар"
              accessibilityLabel="Найти товар на прилавке"
              returnKeyType="search"
              autoCorrect={false}
              clearButtonMode="while-editing"
              leading={<Search size={20} color={color.inkMuted} />}
              style={s.search}
            />
            <RNText style={s.count}>
              В наличии {onSale} из {items.length}
            </RNText>
          </>
        ) : null}
      </View>

      <FlatList
        data={shown}
        extraData={goods.pending}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ProductRow
            product={item}
            busy={goods.pending.has(item.id)}
            onToggle={(available) => void goods.setAvailable(item.id, available)}
            onEdit={() => setEditing(item)}
          />
        )}
        ItemSeparatorComponent={Gap}
        ListHeaderComponent={
          goods.notice || (items && goods.failed) ? (
            <View style={s.notes}>
              {/* Refreshing failed: the last shelf stays, and the way to try again sits above it. */}
              {items && goods.failed ? (
                <LoadError text="Не удалось обновить список" onRetry={() => void goods.reload()} />
              ) : null}
              {goods.notice ? (
                <Paper flat>
                  <RNText style={s.notice} accessibilityRole="alert">
                    {goods.notice}
                  </RNText>
                </Paper>
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={empty}
        ListFooterComponent={
          goods.truncated ? <RNText style={s.footer}>Показаны первые 1000 товаров</RNText> : null
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + TAB_BAR + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={TONE.ochreLight}
            colors={[TONE.pomegranateDeep]}
          />
        }
      />

      <EditSheet
        product={editing}
        onClose={() => setEditing(null)}
        onSave={goods.save}
        onSale={goods.startSale}
        onEndSale={goods.endSale}
      />
    </Ground>
  );
}

const Gap = () => <View style={s.gap} />;

/** Four slips in kraft: the shape of the shelf before it has any goods. */
function Skeleton() {
  return (
    <View accessible accessibilityLabel="Загрузка" style={s.bones}>
      {[0, 1, 2, 3].map((i) => (
        <Bone key={i} style={{ height: 168 }} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  head: { paddingHorizontal: 16, paddingBottom: 12, gap: 4 },
  title: { fontFamily: sceneFont.display, ...scale.headline, color: TONE.creamLight },
  stall: { fontFamily: sceneFont.ui, ...scale.body, color: TONE.creamMuted },
  search: { marginTop: 8 },
  count: {
    fontFamily: sceneFont.ui,
    ...scale.body,
    color: TONE.creamMuted,
    fontVariant: ['tabular-nums'],
    marginTop: 4,
  },
  content: { paddingHorizontal: 16 },
  notes: { gap: 8, marginBottom: 8 },
  notice: { fontFamily: sceneFont.ui, ...scale.body, color: HALL.pomegranate },
  gap: { height: 8 },
  bones: { gap: 8 },
  footer: {
    fontFamily: sceneFont.italic,
    ...scale.body,
    color: TONE.creamMuted,
    textAlign: 'center',
    marginTop: 16,
  },
});
