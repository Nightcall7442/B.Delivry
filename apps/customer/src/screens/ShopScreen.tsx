/**
 * A shop is not a person behind a counter but a shelf under a signboard: the
 * shop's photograph (the aisle, the glass front, the corner shop at night)
 * fills the top of the screen, the board with the chain's name, the nearest
 * branch and the hours sits on it; under it a
 * search line, the shelves (only the categories the shop actually stocks) and
 * the goods as photo cards, page by page as you scroll. Two shortcuts a
 * grocery run actually needs: «Как в прошлый раз» and «Собрать по списку».
 */
import {
  alpha,
  branchesOf,
  closesToday,
  HALL,
  type MapStoreDto,
  productLineTotal,
  TONE,
  tr,
} from '@bazar/storefront';
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
  ground,
  Say,
  Scene,
  scene,
  SceneButton,
  sceneFont,
  TopFade,
  useSceneTop,
} from '@/components/bazar';
import { ProductTile } from '@/components/shop/ProductTile';
import { LoadError } from '@/components/ui/Page';
import { useAddress } from '@/features/address/store';
import { useCart, useCartActions } from '@/features/cart/store';
import { useFavorite } from '@/features/favorites/store';
import { listStores } from '@/lib/catalog';
import { shareLink, stallUrl } from '@/lib/share';
import { useData, useList } from '@/lib/use-data';
import {
  ArrowLeft,
  Heart,
  Share as ShareIcon,
  Clock,
  Mic,
  Search,
  api,
  noOutline,
  radius,
  scale,
  shadow,
  useAuth,
  useLocale,
} from '@bazar/mobile';

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
  const favorite = useFavorite('store', store.id, `/store/${store.id}`);
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
  const stores = useList(() => listStores(), []);
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
  // As the order will charge it: a quantity price counts.
  const total = inCart.reduce((sum, p) => sum + productLineTotal(p, quantities[p.id] ?? 0), 0);
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
            style={({ pressed }) => [s.shortcut, s.shortcutKraft, pressed && { opacity: 0.9 }]}
          >
            <Text style={s.shortcutTitle}>
              {refilled ? t('shop.lastTimeAdded') : t('shop.lastTime')}
            </Text>
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
            <Mic size={18} color={scene.ochreLight} />
            <Text style={[s.shortcutTitle, { color: scene.cream }]}>{t('shop.byList')}</Text>
          </View>
          <Text style={[s.shortcutHint, { color: scene.creamMuted }]} numberOfLines={1}>
            {t('shop.byListHint')}
          </Text>
        </Pressable>
      </View>

      <Glass style={s.searchLine}>
        <Search size={18} color={scene.creamMuted} />
        <TextInput
          value={typed}
          onChangeText={setTyped}
          placeholder={t('shop.search')}
          placeholderTextColor={scene.creamMuted}
          returnKeyType="search"
          style={s.searchInput}
        />
        {typed ? (
          <Pressable onPress={() => setTyped('')} hitSlop={12}>
            <Text style={s.clear}>×</Text>
          </Pressable>
        ) : null}
      </Glass>

      <Eyebrow style={{ paddingHorizontal: 20, marginTop: 18 }}>{t('shop.shelves')}</Eyebrow>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        <Pressable onPress={() => setCategory(null)} hitSlop={6}>
          <Glass style={[s.chip, category === null && s.chipOn]}>
            <Text style={[s.chipText, category === null && s.chipTextOn]}>{t('common.all')}</Text>
          </Glass>
        </Pressable>
        {(shelves ?? []).map((c: CategoryDto) => (
          <Pressable
            key={c.id}
            onPress={() => setCategory(category === c.id ? null : c.id)}
            hitSlop={6}
          >
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
    <View style={{ flex: 1 }}>
      <Scene source={hero} style={StyleSheet.absoluteFill}>
        {null}
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
        renderItem={({ item: product, index }) => (
          <ProductTile product={product} index={index} style={s.card} />
        )}
        ListEmptyComponent={
          loading ? null : failed ? (
            <View style={{ padding: 20 }}>
              <LoadError onRetry={() => void load(1, true)} />
            </View>
          ) : (
            <Say color={scene.creamMuted} style={{ paddingHorizontal: 20, paddingTop: 8 }}>
              {search ? t('shop.notFound') : t('shop.empty')}
            </Say>
          )
        }
        ListFooterComponent={
          loading && items.length > 0 ? (
            <View style={s.footer}>
              <ActivityIndicator color={scene.ochreLight} />
              <Text style={s.footerText}>{t('shop.loading')}</Text>
            </View>
          ) : loading ? (
            <ActivityIndicator color={scene.ochreLight} style={{ marginTop: 24 }} />
          ) : null
        }
      />

      <TopFade height={top + 58} />
      <View style={[s.top, { top }]}>
        <SceneButton
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        >
          <ArrowLeft size={20} color={scene.ink} />
        </SceneButton>
        <View style={s.topEnd}>
          <SceneButton
            onPress={() =>
              shareLink(
                t('share.stall', { name: tr(store.name, locale) }),
                stallUrl(locale, store.id),
              )
            }
            label={t('common.share')}
          >
            <ShareIcon size={18} color={scene.ink} />
          </SceneButton>
          <SceneButton
            onPress={favorite.toggle}
            label={t(favorite.saved ? 'fav.forget' : 'fav.save')}
            selected={favorite.saved}
          >
            <Heart
              size={20}
              color={scene.pomegranate}
              fill={favorite.saved ? scene.pomegranate : 'none'}
            />
          </SceneButton>
        </View>
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
  top: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  topEnd: { flexDirection: 'row', gap: 10 },
  // The painted board over the door: lapis with an ochre rule under the name — paper's corners.
  board: {
    marginHorizontal: 20,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
    gap: 6,
    borderRadius: radius.paper,
    backgroundColor: scene.board,
    borderWidth: 1,
    borderColor: alpha(HALL.ochre, 0.35),
    ...shadow.paper,
  },
  // Over the shop's photograph the paint lets a little of it through.
  boardOnPhoto: { backgroundColor: alpha(TONE.board, 0.9) },
  boardName: {
    fontFamily: sceneFont.display,
    ...scale.headline,
    letterSpacing: 0.5,
    color: scene.ochreLight,
  },
  boardLine: { fontFamily: sceneFont.uiText, ...scale.body, color: scene.creamMuted },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  pill: {
    height: 32,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // Sums and minutes in the pills and hints: tabular figures.
  pillText: {
    fontFamily: sceneFont.ui,
    ...scale.caption,
    color: scene.cream,
    fontVariant: ['tabular-nums'],
  },
  closed: { fontFamily: sceneFont.ui, ...scale.caption, color: scene.ochreLight, marginTop: 2 },
  shortcuts: { paddingHorizontal: 20, paddingTop: 16, gap: 10 },
  shortcut: { borderRadius: radius.paper, paddingHorizontal: 16, paddingVertical: 12, gap: 2 },
  // «Как в прошлый раз» is kraft lifting off the ground; «Собрать по списку» is glass.
  shortcutKraft: { backgroundColor: scene.kraft, ...shadow.paper },
  shortcutList: { backgroundColor: scene.glass, borderWidth: 1, borderColor: scene.glassEdge },
  shortcutTitle: { fontFamily: sceneFont.display, ...scale.lead, color: scene.ink },
  shortcutHint: {
    fontFamily: sceneFont.uiText,
    ...scale.caption,
    color: scene.inkSoft,
    fontVariant: ['tabular-nums'],
  },
  searchLine: {
    marginHorizontal: 20,
    marginTop: 16,
    height: 48,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: sceneFont.uiText,
    ...scale.body,
    color: scene.cream,
    paddingVertical: 0,
    ...(noOutline as object),
  },
  clear: { fontFamily: sceneFont.uiText, ...scale.title, color: scene.creamMuted },
  chips: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14, gap: 6 },
  chip: { height: 32, paddingHorizontal: 12, justifyContent: 'center' },
  chipOn: { backgroundColor: scene.cream, borderColor: scene.cream },
  chipText: { fontFamily: sceneFont.ui, ...scale.caption, color: scene.cream },
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
  footerText: {
    fontFamily: sceneFont.uiText,
    ...scale.caption,
    color: scene.creamMuted,
    textShadowColor: ground(0.6),
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  cartBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: scene.pomegranate,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    ...shadow.paper,
  },
  cartTitle: {
    fontFamily: sceneFont.uiHeavy,
    ...scale.body,
    color: scene.cream,
    fontVariant: ['tabular-nums'],
  },
  cartSub: { fontFamily: sceneFont.uiText, ...scale.caption, color: scene.creamMuted },
  cartTotal: {
    fontFamily: sceneFont.uiHeavy,
    ...scale.lead,
    color: scene.cream,
    fontVariant: ['tabular-nums'],
  },
});
