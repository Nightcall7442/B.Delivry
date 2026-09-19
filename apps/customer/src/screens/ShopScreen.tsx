/**
 * A shop is not a person behind a counter but a shelf under a signboard: the
 * shop's photograph (the aisle, the glass front, the corner shop at night)
 * fills the top of the screen, the board with the chain's name, the nearest
 * branch and the hours sits on it; under it a
 * search line, the shelves (only the categories the shop actually stocks) and
 * the goods as photo cards, page by page as you scroll. Two shortcuts a
 * grocery run actually needs: «Как в прошлый раз» and «Собрать по списку».
 */
import { branchesOf, closesToday, tr, unitLabel, type MapStoreDto } from '@bazar/storefront';
import type { CategoryDto, OrderDto, ProductDto } from '@bazar/types';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BasketGlyph,
  Eyebrow,
  Glass,
  Hand,
  ProductCard,
  Scene,
  SceneButton,
  scene,
  sceneFont,
  useSceneTop,
} from '@/components/bazar';
import { LoadError } from '@/components/ui/Page';
import { useAddress } from '@/features/address/store';
import { useCart, useCartActions } from '@/features/cart/store';
import { listStores } from '@/lib/catalog';
import { useData } from '@/lib/use-data';
import { ArrowLeft, Clock, Mic, Search, api, useAuth, useLocale } from '@bazar/mobile';

const PAGE = 24;

export function ShopScreen({ store }: { store: MapStoreDto }) {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { user } = useAuth();
  const { address } = useAddress();
  const { quantities } = useCart();
  const { setQuantity } = useCartActions();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const top = useSceneTop();
  const units = unitLabel(locale);
  const hero = store.counterPhotoUrl ?? store.coverUrl ?? null;

  const [category, setCategory] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<ProductDto[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);

  // Typing waits for a pause; the request goes for the settled word.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), 350);
    return () => clearTimeout(timer);
  }, [typed]);

  const shelves = useData(() => api().catalog.categories({ storeId: store.id }), [store.id]);
  const stores = useData(() => listStores(), []) ?? [];
  const branch = useMemo(() => {
    const all = branchesOf(store, stores, address?.point ?? null);
    return all.length > 1 ? all[0]! : null;
  }, [store, stores, address]);

  const load = useCallback(
    async (next: number, replace: boolean) => {
      const id = ++request.current;
      setLoading(true);
      try {
        const result = await api().catalog.products({
          storeId: store.id,
          ...(category ? { categoryId: category } : {}),
          ...(search ? { search } : {}),
          page: next,
          pageSize: PAGE,
        });
        if (id !== request.current) return;
        setItems((current) => (replace ? result.items : [...current, ...result.items]));
        setPage(next);
        setHasNext(result.pagination.hasNext);
        setFailed(false);
      } catch {
        if (id === request.current) setFailed(true);
      } finally {
        if (id === request.current) setLoading(false);
      }
    },
    [store.id, category, search],
  );
  useEffect(() => {
    void load(1, true);
  }, [load]);

  // «Как в прошлый раз»: the last delivered order from this shop, one tap to refill the basket.
  const [last, setLast] = useState<OrderDto | null>(null);
  const [refilled, setRefilled] = useState(false);
  useEffect(() => {
    if (!user) return;
    api()
      .orders.list({ storeId: store.id, status: 'DELIVERED', pageSize: 1 })
      .then((result) => setLast(result.items[0] ?? null))
      .catch(() => setLast(null));
  }, [user, store.id]);
  const refill = () => {
    if (!last) return;
    for (const line of last.items) {
      if (line.productId)
        setQuantity(line.productId, (quantities[line.productId] ?? 0) + line.quantity);
    }
    setRefilled(true);
  };

  const inCart = items.filter((p) => quantities[p.id]);
  const total = inCart.reduce((sum, p) => sum + p.price.amount * (quantities[p.id] ?? 0), 0);
  const closes = closesToday(store);
  const kind = t(`store.type.${store.type}` as 'store.type.SHOP');

  const header = (
    <View>
      {/* The photograph breathes first; the board hangs over its lower edge. */}
      <View style={{ height: Math.round(height * (hero ? 0.34 : 0.1)) }} />
      <View style={[s.board, hero && s.boardOnPhoto]}>
        <Eyebrow>
          {[kind, closes ? t('shop.until', { time: closes }) : t('shop.closedToday')].join(' · ')}
        </Eyebrow>
        <Text style={s.boardName} numberOfLines={3}>
          {tr(store.name, locale)}
        </Text>
        <Text style={s.boardLine} numberOfLines={2}>
          {branch
            ? t('shop.branch', { address: branch.address ?? tr(branch.name, locale) })
            : (store.address ?? '')}
        </Text>
        <View style={s.pills}>
          {store.minOrder ? (
            <Glass style={s.pill}>
              <Text style={s.pillText}>{t('shop.minOrder', { sum: t.money(store.minOrder) })}</Text>
            </Glass>
          ) : null}
          {store.freeDeliveryThreshold ? (
            <Glass style={s.pill}>
              <Text style={s.pillText}>
                {t('shop.freeFrom', { sum: t.money(store.freeDeliveryThreshold) })}
              </Text>
            </Glass>
          ) : null}
          <Glass style={s.pill}>
            <Clock size={14} color={scene.cream} />
            <Text style={s.pillText}>{t('store.prep', { minutes: store.preparationMinutes })}</Text>
          </Glass>
        </View>
        {!store.isOpen ? <Text style={s.closed}>{t('store.closedHint')}</Text> : null}
      </View>

      {/* Two shortcuts before the shelves. */}
      <View style={s.shortcuts}>
        {last && last.items.length > 0 ? (
          <Pressable
            onPress={refill}
            disabled={refilled}
            style={({ pressed }) => [s.shortcut, pressed && { opacity: 0.9 }]}
          >
            <Hand size={22} color={scene.ink}>
              {refilled ? t('shop.lastTimeAdded') : t('shop.lastTime')}
            </Hand>
            <Text style={s.shortcutHint} numberOfLines={1}>
              {t('shop.lastTimeHint', {
                items: t.n('cart.items', last.items.length),
                sum: t.money(last.totals.total.amount),
              })}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => router.push('/list')}
          style={({ pressed }) => [s.shortcut, s.shortcutList, pressed && { opacity: 0.9 }]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Mic size={18} color={scene.saffron} />
            <Hand size={22} color={scene.cream}>
              {t('shop.byList')}
            </Hand>
          </View>
          <Text style={[s.shortcutHint, { color: scene.creamDim }]} numberOfLines={1}>
            {t('shop.byListHint')}
          </Text>
        </Pressable>
      </View>

      <View style={s.searchLine}>
        <Search size={18} color={scene.creamDim} />
        <TextInput
          value={typed}
          onChangeText={setTyped}
          placeholder={t('shop.search')}
          placeholderTextColor={scene.creamDim}
          returnKeyType="search"
          style={s.searchInput}
        />
        {typed ? (
          <Pressable onPress={() => setTyped('')} hitSlop={8}>
            <Text style={s.clear}>×</Text>
          </Pressable>
        ) : null}
      </View>

      <Eyebrow style={{ paddingHorizontal: 20, marginTop: 18 }}>{t('shop.shelves')}</Eyebrow>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        <Pressable onPress={() => setCategory(null)}>
          <Glass style={[s.chip, category === null && s.chipOn]}>
            <Text style={[s.chipText, category === null && s.chipTextOn]}>{t('common.all')}</Text>
          </Glass>
        </Pressable>
        {(shelves ?? []).map((c: CategoryDto) => (
          <Pressable key={c.id} onPress={() => setCategory(category === c.id ? null : c.id)}>
            <Glass style={[s.chip, category === c.id && s.chipOn]}>
              <Text style={[s.chipText, category === c.id && s.chipTextOn]}>
                {tr(c.name, locale)}
              </Text>
            </Glass>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: scene.night }}>
      <Scene source={hero} style={StyleSheet.absoluteFill}>
        <View />
      </Scene>
      <FlatList
        data={items}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={s.row}
        ListHeaderComponent={header}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (hasNext && !loading) void load(page + 1, false);
        }}
        renderItem={({ item: product, index }) => {
          const qty = quantities[product.id] ?? 0;
          return (
            <ProductCard
              style={s.card}
              compact
              photo={product.images[0]?.url ?? null}
              tilt={[-1.2, 1, 0.6, -0.8][index % 4] ?? 0}
              side={index % 2 ? 'right' : 'left'}
              title={tr(product.name, locale)}
              price={`${t.money(product.price.amount, product.price.currency)} / ${units[product.unit]}`}
              note={product.oldPrice ? t.money(product.oldPrice.amount) : undefined}
              count={qty}
              countLabel={t('scene.inCart', { count: `${t.qty(qty)} ${units[product.unit]}` })}
              onPress={() => router.push(`/product/${product.id}`)}
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
        }}
        ListEmptyComponent={
          loading ? null : failed ? (
            <View style={{ padding: 20 }}>
              <LoadError onRetry={() => void load(1, true)} />
            </View>
          ) : (
            <Hand size={22} color={scene.creamDim} style={{ paddingHorizontal: 20, paddingTop: 8 }}>
              {search ? t('shop.notFound') : t('shop.empty')}
            </Hand>
          )
        }
        ListFooterComponent={
          loading && items.length > 0 ? (
            <View style={s.footer}>
              <ActivityIndicator color={scene.saffron} />
              <Text style={s.footerText}>{t('shop.loading')}</Text>
            </View>
          ) : loading ? (
            <ActivityIndicator color={scene.saffron} style={{ marginTop: 24 }} />
          ) : null
        }
      />

      <View style={[s.top, { top }]}>
        <SceneButton
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        >
          <ArrowLeft size={20} color={scene.ink} />
        </SceneButton>
      </View>

      {inCart.length > 0 ? (
        <Pressable
          onPress={() => router.push('/(tabs)/cart')}
          style={({ pressed }) => [
            s.cartBar,
            { bottom: 24 + insets.bottom },
            pressed && { opacity: 0.92 },
          ]}
        >
          <BasketGlyph color={scene.cream} size={22} />
          <View style={{ flex: 1 }}>
            <Text style={s.cartTitle}>{t.n('cart.items', inCart.length)}</Text>
            <Text style={s.cartSub} numberOfLines={1}>
              {tr(store.name, locale)}
            </Text>
          </View>
          <Text style={s.cartTotal}>{t.money(total)} →</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  top: { position: 'absolute', left: 20, right: 20, flexDirection: 'row' },
  // The painted board over the door: ink with a saffron rule under the name.
  board: {
    marginHorizontal: 20,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
    gap: 6,
    borderRadius: 14,
    backgroundColor: scene.ink,
    borderWidth: 1,
    borderColor: 'rgba(227,155,47,0.35)',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  boardOnPhoto: { backgroundColor: 'rgba(43,27,14,0.9)' },
  boardName: {
    fontFamily: sceneFont.display,
    fontSize: 34,
    lineHeight: 37,
    letterSpacing: 0.5,
    color: scene.saffronLight,
  },
  boardLine: { fontFamily: sceneFont.uiText, fontSize: 13, color: scene.creamDim },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  pill: {
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pillText: { fontFamily: sceneFont.ui, fontSize: 12, color: scene.cream },
  closed: { fontFamily: sceneFont.ui, fontSize: 12, color: scene.saffronLight, marginTop: 2 },
  shortcuts: { paddingHorizontal: 20, paddingTop: 16, gap: 10 },
  shortcut: {
    backgroundColor: scene.kraft,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 2,
  },
  shortcutList: {
    backgroundColor: 'rgba(251,241,222,0.08)',
    borderWidth: 1,
    borderColor: scene.glassEdge,
  },
  shortcutHint: { fontFamily: sceneFont.uiText, fontSize: 12, color: scene.inkSoft },
  searchLine: {
    marginHorizontal: 20,
    marginTop: 16,
    height: 48,
    borderRadius: 24,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(30,20,8,0.42)',
    borderWidth: 1,
    borderColor: scene.glassEdge,
  },
  searchInput: {
    flex: 1,
    fontFamily: sceneFont.uiText,
    fontSize: 15,
    color: scene.cream,
    paddingVertical: 0,
  },
  clear: { fontFamily: sceneFont.display, fontSize: 22, color: scene.creamDim },
  chips: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14, gap: 6 },
  chip: { height: 32, borderRadius: 16, paddingHorizontal: 12, justifyContent: 'center' },
  chipOn: { backgroundColor: scene.cream, borderColor: scene.cream },
  chipText: { fontFamily: sceneFont.ui, fontSize: 12, color: scene.cream },
  chipTextOn: { color: scene.ink },
  row: { paddingHorizontal: 20, gap: 12, marginBottom: 18 },
  card: { flex: 1, maxWidth: '50%' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    padding: 16,
  },
  footerText: { fontFamily: sceneFont.uiText, fontSize: 12, color: scene.creamDim },
  cartBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 56,
    borderRadius: 18,
    backgroundColor: scene.pomegranate,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    shadowColor: scene.pomegranate,
    shadowOpacity: 0.6,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  cartTitle: { fontFamily: sceneFont.uiHeavy, fontSize: 13, color: scene.cream },
  cartSub: { fontFamily: sceneFont.uiText, fontSize: 10.5, color: '#D9C7A6' },
  cartTotal: { fontFamily: sceneFont.display, fontSize: 18, color: scene.cream },
});
