/**
 * A row of the bazaar: the stalls that sell this category, one per page,
 * swiped along like walking past them. Each page is the stall's photograph
 * with the person behind it, their line, and the cardboard signs of what is
 * on the counter — three of them, the rest on the stall itself.
 */
import { isShopfront, tr, unitLabel } from '@bazar/storefront';
import type { MapStoreDto } from '@bazar/storefront';
import type { ProductDto } from '@bazar/types';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BasketGlyph,
  Display,
  Eyebrow,
  Hand,
  Scene,
  SceneButton,
  Sign,
  scene,
  sceneFont,
  useSceneTop,
} from '@/components/bazar';
import { Bone, LoadError } from '@/components/ui/Page';
import { useCart, useCartActions, useCartCount } from '@/features/cart/store';
import { listCategories, listProducts, listStores } from '@/lib/catalog';
import { EMPTY, useLoad } from '@/lib/use-data';
import { ArrowLeft, Chevron, Search, useLocale } from '@bazar/mobile';

const SIGNS_ON_PAGE = 3;

export function RowScreen({ categoryId }: { categoryId: string }) {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const top = useSceneTop();
  const count = useCartCount();
  const categoryLoad = useLoad(() => listCategories(), []);
  const storeLoad = useLoad(() => listStores(), []);
  const productLoad = useLoad(() => listProducts({ categoryId }), [categoryId]);
  const [page, setPage] = useState(0);
  const list = useRef<FlatList<Stall>>(null);

  const category = categoryLoad.data?.find((c) => c.id === categoryId) ?? null;
  // A stall is a store with at least one product of this category on the counter.
  const stalls = useMemo<Stall[]>(() => {
    const byStore = new Map<string, ProductDto[]>();
    for (const product of productLoad.data ?? EMPTY) {
      if (!product.available) continue;
      const bucket = byStore.get(product.storeId) ?? [];
      bucket.push(product);
      byStore.set(product.storeId, bucket);
    }
    // Shops are not part of the row: their goods live behind their own boards.
    return (storeLoad.data ?? EMPTY)
      .filter((store) => byStore.has(store.id) && !isShopfront(store))
      .map((store) => ({ store, products: byStore.get(store.id) ?? [] }));
  }, [productLoad.data, storeLoad.data]);

  const loading = !categoryLoad.data || !storeLoad.data || !productLoad.data;
  const failed = loading && (categoryLoad.error || storeLoad.error || productLoad.error);
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== page) setPage(next);
  };
  const current = stalls[page];
  const next = stalls[page + 1];

  return (
    <View style={{ flex: 1, backgroundColor: scene.night }}>
      {loading ? (
        <Scene source={null}>
          <View style={{ padding: 20, paddingTop: top + 60, gap: 12 }}>
            {failed ? (
              <LoadError
                onRetry={() =>
                  void Promise.all([
                    categoryLoad.reload(),
                    storeLoad.reload(),
                    productLoad.reload(),
                  ])
                }
              />
            ) : (
              <>
                <Bone style={{ height: 32, width: 180 }} />
                <Bone style={{ height: 200 }} />
              </>
            )}
          </View>
        </Scene>
      ) : stalls.length === 0 ? (
        <Scene source={null}>
          <View style={{ padding: 20, paddingTop: top + 80, gap: 12 }}>
            <Display size={30}>{category ? tr(category.name, locale) : ''}</Display>
            <Hand size={24} color={scene.creamMuted}>
              {t('scene.rowEmpty')}
            </Hand>
          </View>
        </Scene>
      ) : (
        <FlatList
          ref={list}
          data={stalls}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={32}
          keyExtractor={(stall) => stall.store.id}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          renderItem={({ item, index }) => (
            <StallPage
              stall={item}
              width={width}
              height={height}
              index={index}
              total={stalls.length}
              bottomInset={insets.bottom}
              onOpen={() => router.push(`/store/${item.store.id}`)}
              onProduct={(id) => router.push(`/product/${id}`)}
            />
          )}
        />
      )}

      {/* Header, stall strip and the bottom bar float over every page. */}
      <View style={[s.top, { top }]}>
        <SceneButton
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        >
          <ArrowLeft size={20} color={scene.ink} />
        </SceneButton>
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Display size={22} numberOfLines={1}>
            {category ? tr(category.name, locale) : ''}
          </Display>
          <Text style={s.subtitle}>{current ? `${t('scene.stalls')} · ${stalls.length}` : ''}</Text>
        </View>
        <SceneButton onPress={() => router.push('/search')}>
          <Search size={20} color={scene.ink} />
        </SceneButton>
      </View>

      {stalls.length > 1 ? (
        <View style={[s.strip, { top: top + 66 }]}>
          <Text style={s.stripLabel}>{t('scene.stalls')}</Text>
          {stalls.slice(0, 6).map((stall, index) => (
            <Pressable
              key={stall.store.id}
              onPress={() => list.current?.scrollToIndex({ index, animated: true })}
              hitSlop={4}
            >
              <Image
                source={thumbOf(stall.store)}
                style={[s.thumb, index === page && s.thumbCurrent]}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            </Pressable>
          ))}
          <Text style={s.stripCount}>
            {page + 1} / {stalls.length}
          </Text>
        </View>
      ) : null}

      <View style={[s.bottom, { bottom: 24 + insets.bottom }]}>
        <Pressable
          style={s.next}
          disabled={!next}
          onPress={() => list.current?.scrollToIndex({ index: page + 1, animated: true })}
        >
          {next ? (
            <>
              <View style={{ transform: [{ rotate: '180deg' }] }}>
                <Chevron size={20} color={scene.saffron} />
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={s.nextTitle} numberOfLines={1}>
                  {t('scene.next', { name: next.store.ownerName ?? tr(next.store.name, locale) })}
                </Text>
                <Text style={s.nextSub} numberOfLines={1}>
                  {next.store.standNumber ?? tr(next.store.name, locale)}
                </Text>
              </View>
            </>
          ) : null}
        </Pressable>
        <CartPill count={count} onPress={() => router.push('/(tabs)/cart')} />
      </View>
    </View>
  );
}

interface Stall {
  store: MapStoreDto;
  products: ProductDto[];
}

const thumbOf = (store: MapStoreDto) => {
  const uri = store.ownerPhotoUrl ?? store.coverUrl;
  return uri ? { uri } : null;
};

function StallPage({
  stall,
  width,
  height,
  bottomInset,
  onOpen,
  onProduct,
}: {
  stall: Stall;
  width: number;
  height: number;
  index: number;
  total: number;
  bottomInset: number;
  onOpen: () => void;
  onProduct: (productId: string) => void;
}) {
  const { locale, t } = useLocale();
  const { quantities } = useCart();
  const { setQuantity } = useCartActions();
  const { store, products } = stall;
  const units = unitLabel(locale);
  const shown = products.slice(0, SIGNS_ON_PAGE);
  const rest = products.length - shown.length;
  const photo = store.counterPhotoUrl ?? store.coverUrl;
  const person = store.ownerPhotoUrl ?? store.coverUrl;
  const takenAt = store.counterPhotoAt
    ? new Date(store.counterPhotoAt).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Tashkent',
      })
    : null;

  return (
    <Scene source={photo} style={{ width, height }}>
      <View style={[s.person, { top: Math.round(height * 0.38) }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {person ? (
            <Image
              source={{ uri: person }}
              style={s.avatar}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : null}
          <View style={{ flex: 1, gap: 1 }}>
            <Display size={30} numberOfLines={1}>
              {store.ownerName ?? tr(store.name, locale)}
            </Display>
            <Text style={s.personMeta} numberOfLines={1}>
              {[
                store.standNumber,
                store.ownerSince ? t('scene.sinceYear', { year: store.ownerSince }) : null,
                store.rating ? `★ ${store.rating.toFixed(1)}` : null,
                t('scene.weighed'),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </View>
        {store.ownerMotto ? (
          <Hand size={26} numberOfLines={3}>
            «{tr(store.ownerMotto, locale)}»
          </Hand>
        ) : null}
      </View>

      <View style={[s.signs, { bottom: 122 + bottomInset }]}>
        <Eyebrow style={{ marginBottom: 12 }}>
          {t('scene.onCounter')}
          {takenAt ? ` · ${t('scene.counterPhotoAt', { time: takenAt })}` : ''}
        </Eyebrow>
        <View style={s.grid}>
          {shown.map((product, i) => {
            const qty = quantities[product.id] ?? 0;
            return (
              <Sign
                key={product.id}
                style={s.sign}
                tilt={[-1, 1, 0.5][i] ?? 0}
                title={tr(product.name, locale)}
                price={`${t.money(product.price.amount, product.price.currency)} / ${units[product.unit]}`}
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
          <Sign
            style={s.sign}
            tilt={-1}
            accent
            title={rest > 0 ? t('scene.moreOnCounter', { count: rest }) : tr(store.name, locale)}
            note={t('scene.wholeCounter')}
            onPress={onOpen}
          />
        </View>
      </View>
    </Scene>
  );
}

function CartPill({ count, onPress }: { count: number; onPress: () => void }) {
  const { t } = useLocale();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.cartPill, pressed && { opacity: 0.9 }]}>
      <BasketGlyph color={scene.cream} size={22} />
      <View>
        <Text style={s.cartCount}>{count}</Text>
        <Text style={s.cartLabel}>{t.n('cart.items', count)}</Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  top: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subtitle: {
    fontFamily: sceneFont.ui,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: scene.creamMuted,
  },
  strip: { position: 'absolute', right: 12, alignItems: 'center', gap: 8 },
  stripLabel: {
    fontFamily: sceneFont.uiHeavy,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: scene.creamMuted,
  },
  thumb: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'rgba(251,241,222,0.5)',
    opacity: 0.8,
    backgroundColor: '#3A2A1A',
  },
  thumbCurrent: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: scene.saffron,
    opacity: 1,
  },
  stripCount: { fontFamily: sceneFont.uiHeavy, fontSize: 10, color: scene.creamMuted },
  person: { position: 'absolute', left: 20, right: 80, gap: 8 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    borderColor: scene.saffron,
    backgroundColor: '#3A2A1A',
  },
  personMeta: { fontFamily: sceneFont.ui, fontSize: 12, color: scene.creamMuted },
  signs: { position: 'absolute', left: 20, right: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, rowGap: 14 },
  sign: { width: '47%', flexGrow: 1 },
  bottom: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  next: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  nextTitle: { fontFamily: sceneFont.ui, fontSize: 12, color: scene.creamMuted },
  nextSub: { fontFamily: sceneFont.uiText, fontSize: 12, color: scene.creamDim },
  cartPill: {
    height: 56,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: scene.pomegranate,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: scene.pomegranate,
    shadowOpacity: 0.6,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  cartCount: { fontFamily: sceneFont.display, fontSize: 17, lineHeight: 18, color: scene.cream },
  cartLabel: { fontFamily: sceneFont.ui, fontSize: 10, color: scene.cream, opacity: 0.85 },
});
