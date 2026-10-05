/**
 * One product as a scene: the photograph fills the screen, the product's own
 * cardboard price sign hangs on it by its pin, the vendor says their line, and
 * the amount is set in the vendor's units (a melon, half a kilo of greens).
 * What the stall promises — weighing at the counter, freshness, haggling — sits
 * as pills; reviews and the rest of the counter follow, scrolling over the photo.
 */
import { arrivedToday, cashbackFor, estimateDelivery, tr, unitLabel } from '@bazar/storefront';
import type { MapStoreDto } from '@bazar/storefront';
import type { ProductDto, ReviewDto } from '@bazar/types';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Eyebrow,
  Glass,
  Pin,
  Say,
  Scene,
  SceneButton,
  Sign,
  scene,
  sceneFont,
  useSceneTop,
  useSwing,
} from '@/components/bazar';
import { Bone } from '@/components/ui/Page';
import { useAddress } from '@/features/address/store';
import { useCart, useCartActions, useCartItem } from '@/features/cart/store';
import { useFavorite } from '@/features/favorites/store';
import { getProduct, getStore, listProducts } from '@/lib/catalog';
import { useData } from '@/lib/use-data';
import {
  ArrowLeft,
  Heart,
  Leaf,
  Minus,
  Photo,
  Plus,
  Scale,
  Scooter,
  Star,
  Tag,
  Wallet,
  api,
  radius,
  scale,
  shadow,
  useLocale,
} from '@bazar/mobile';

export function ProductScreen({ productId }: { productId: string }) {
  const product = useData(() => getProduct(productId), [productId]);
  const store = useData(
    () => (product ? getStore(product.storeId) : Promise.resolve(null)),
    [product?.storeId],
  );
  const reviews =
    useData(
      () =>
        product
          ? api()
              .reviews.list({ target: 'STORE', targetId: product.storeId, pageSize: 20 })
              .then((page) => page.items.filter((r) => r.comment).slice(0, 3))
          : Promise.resolve([]),
      [product?.storeId],
    ) ?? [];
  const { address } = useAddress();
  const estimate =
    store && address
      ? estimateDelivery(store.point, address.point, store.preparationMinutes)
      : null;
  const siblings = useData(
    () =>
      product ? listProducts({ storeId: product.storeId }) : Promise.resolve([] as ProductDto[]),
    [product?.storeId],
  );
  const similar = useMemo(
    () =>
      (siblings ?? [])
        .filter((p) => p.id !== productId && p.available)
        .sort(
          (a, b) =>
            Number(b.categoryId === product?.categoryId) -
            Number(a.categoryId === product?.categoryId),
        )
        .slice(0, 4),
    [siblings, productId, product?.categoryId],
  );
  const top = useSceneTop();

  if (!product)
    return (
      <Scene source={null}>
        <View style={{ padding: 20, paddingTop: top + 60, gap: 12 }}>
          <Bone style={{ height: 240 }} />
          <Bone style={{ height: 32, width: 220 }} />
        </View>
      </Scene>
    );
  return (
    <ProductBody
      product={product}
      store={store ?? null}
      similar={similar}
      reviews={reviews}
      estimate={estimate}
    />
  );
}

function ProductBody({
  product,
  store,
  similar,
  reviews,
  estimate,
}: {
  product: ProductDto;
  store: MapStoreDto | null;
  similar: ProductDto[];
  reviews: ReviewDto[];
  estimate: { etaMinutes: number; fee: { amount: number } } | null;
}) {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const top = useSceneTop();
  const { quantities } = useCart();
  const { setQuantity } = useCartActions();
  const step = product.quantityStep || 1;
  const min = product.minQuantity || step;
  const { quantity, add, remove } = useCartItem(product.id, step, min);
  const favorite = useFavorite('product', product.id, `/product/${product.id}`);
  const units = unitLabel(locale);
  const unit = units[product.unit];
  const shownQty = quantity > 0 ? quantity : min;
  const lineTotal = product.price.amount * shownQty;
  const discount = product.oldPrice
    ? Math.round((1 - product.price.amount / product.oldPrice.amount) * 100)
    : 0;
  const description = product.description ? tr(product.description, locale) : '';
  const photo = product.images[0]?.url ?? null;
  const person = store?.ownerPhotoUrl ?? store?.coverUrl ?? null;
  const swing = useSwing(quantity);

  return (
    <View style={{ flex: 1 }}>
      <Scene source={photo} style={StyleSheet.absoluteFill}>
        {null}
      </Scene>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: Math.round(height * 0.34),
          paddingBottom: 110 + insets.bottom,
        }}
      >
        <View style={s.tagWrap}>
          {/* The product's own price sign: it hangs by its pin and swings when it goes in the basket. */}
          <Animated.View style={[s.tag, { transform: [{ rotate: '-2deg' }, { rotate: swing }] }]}>
            <Pin />
            <Text style={s.tagName}>{tr(product.name, locale)}</Text>
            <View
              style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}
            >
              <Text style={s.tagPrice}>
                {t.money(product.price.amount, product.price.currency)}
              </Text>
              <Text style={s.tagUnit}>/ {unit}</Text>
              {product.oldPrice ? (
                <Text style={s.tagOld}>{t.money(product.oldPrice.amount)}</Text>
              ) : null}
            </View>
            <Text style={s.tagNote}>
              {[
                discount > 0 ? `−${discount} %` : null,
                arrivedToday(product) ? t('store.arrivedToday').toLowerCase() : null,
                product.stock !== null ? t('store.left', { count: product.stock }) : null,
                store ? tr(store.name, locale) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </Animated.View>
        </View>

        {store ? (
          <Pressable onPress={() => router.push(`/store/${store.id}`)} style={s.vendor}>
            {person ? <Photo uri={person} style={s.avatar} /> : null}
            <View style={{ flex: 1, gap: 2 }}>
              {store.ownerMotto ? (
                <Say numberOfLines={3}>«{tr(store.ownerMotto, locale)}»</Say>
              ) : null}
              <Text style={s.vendorName}>
                — {store.ownerName ?? tr(store.name, locale)}
                {store.standNumber ? ` · ${store.standNumber}` : ''}
              </Text>
            </View>
          </Pressable>
        ) : null}

        <View style={s.pills}>
          {[
            [Scale, t('trust.weigh')],
            [Leaf, t('trust.fresh')],
            [Tag, t('trust.haggle')],
          ].map(([Icon, label]) => {
            const I = Icon as typeof Scale;
            return (
              <Glass key={String(label)} style={s.pill}>
                <I size={14} color={scene.ochreLight} />
                <Text style={s.pillText}>{String(label)}</Text>
              </Glass>
            );
          })}
        </View>

        <View style={s.amount}>
          <Eyebrow>{t('product.perUnit', { unit })}</Eyebrow>
          <View style={s.stepper}>
            <Pressable
              onPress={remove}
              disabled={quantity === 0}
              style={({ pressed }) => [
                s.round,
                quantity === 0 && { opacity: 0.4 },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Minus size={22} color={scene.cream} />
            </Pressable>
            <View style={{ alignItems: 'center', gap: 2, flex: 1 }}>
              <Text style={s.qty}>
                {t.qty(shownQty)} {unit}
              </Text>
              <Text style={s.amountSub} numberOfLines={2}>
                {product.unit === 'KG' ? `${t('trust.weigh')} · ` : ''}
                {t.money(lineTotal)}
              </Text>
            </View>
            <Pressable
              onPress={add}
              style={({ pressed }) => [s.round, s.roundAccent, pressed && { opacity: 0.85 }]}
            >
              <Plus size={22} color={scene.cream} />
            </Pressable>
          </View>
          <View style={s.lines}>
            <View style={s.line}>
              <Wallet size={16} color={scene.ochreLight} />
              <Text style={s.lineText}>
                {t('product.cashback', { amount: t.money(cashbackFor(product.price.amount)) })}
              </Text>
            </View>
            {estimate ? (
              <View style={s.line}>
                <Scooter size={16} color={scene.ochreLight} />
                <Text style={s.lineText}>
                  {t('product.delivery', {
                    minutes: estimate.etaMinutes,
                    fee: t.money(estimate.fee.amount),
                  })}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {description ? (
          <View style={s.section}>
            <Eyebrow>{t('product.about')}</Eyebrow>
            <Text style={s.body}>{description}</Text>
          </View>
        ) : null}

        {reviews.length > 0 ? (
          <View style={s.section}>
            <Eyebrow>{t('product.reviews')}</Eyebrow>
            {reviews.map((review) => (
              <Glass key={review.id} style={s.review}>
                <View style={{ flexDirection: 'row', gap: 3 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      size={12}
                      color={scene.ochreLight}
                      fill={n <= review.rating ? scene.ochreLight : 'transparent'}
                    />
                  ))}
                </View>
                <Say step="lead" color={scene.creamMuted}>
                  «{review.comment}»
                </Say>
              </Glass>
            ))}
          </View>
        ) : null}

        {similar.length > 0 ? (
          <View style={s.section}>
            <Eyebrow>{t('scene.onCounter')}</Eyebrow>
            <View style={s.grid}>
              {similar.map((p, i) => {
                const qty = quantities[p.id] ?? 0;
                return (
                  <Sign
                    key={p.id}
                    style={s.sign}
                    tilt={[-1, 1, 0.5, -0.5][i % 4] ?? 0}
                    title={tr(p.name, locale)}
                    price={`${t.money(p.price.amount, p.price.currency)} / ${units[p.unit]}`}
                    count={qty}
                    countLabel={t('scene.inCart', { count: `${t.qty(qty)} ${units[p.unit]}` })}
                    onPress={() => router.push(`/product/${p.id}`)}
                    onAdd={() =>
                      setQuantity(
                        p.id,
                        qty === 0
                          ? p.minQuantity || p.quantityStep || 1
                          : qty + (p.quantityStep || 1),
                      )
                    }
                  />
                );
              })}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={[s.top, { top }]}>
        <SceneButton
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        >
          <ArrowLeft size={20} color={scene.ink} />
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

      <View style={[s.footer, { bottom: 24 + insets.bottom }]}>
        <Pressable
          onPress={() => (quantity > 0 ? router.push('/(tabs)/cart') : add())}
          style={({ pressed }) => [s.cta, pressed && { opacity: 0.92 }]}
        >
          <Text style={s.ctaLabel}>
            {quantity > 0 ? t('product.toCart') : t('product.addToCart')}
          </Text>
          <Text style={s.ctaSum}>{t.money(lineTotal)}</Text>
        </Pressable>
      </View>
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
  },
  tagWrap: { paddingHorizontal: 20, alignItems: 'flex-start' },
  // Cardboard, like every price sign: paper, the paper's edge, the pin on top.
  tag: {
    backgroundColor: scene.paper,
    borderWidth: 1,
    borderColor: scene.paperEdge,
    borderRadius: radius.paper,
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 20,
    gap: 2,
    maxWidth: '100%',
    transformOrigin: 'top',
    ...shadow.paper,
  },
  tagName: { fontFamily: sceneFont.hand, ...scale.headline, color: scene.ink },
  tagPrice: {
    fontFamily: sceneFont.hand,
    ...scale.display,
    color: scene.pomegranate,
    fontVariant: ['tabular-nums'],
  },
  tagUnit: { fontFamily: sceneFont.hand, ...scale.title, color: scene.inkSoft },
  tagOld: {
    fontFamily: sceneFont.hand,
    ...scale.title,
    color: scene.inkSoft,
    textDecorationLine: 'line-through',
    fontVariant: ['tabular-nums'],
  },
  tagNote: {
    fontFamily: sceneFont.ui,
    ...scale.caption,
    color: scene.inkSoft,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  vendor: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: scene.ochre,
    backgroundColor: scene.kraft,
  },
  vendorName: { fontFamily: sceneFont.ui, ...scale.caption, color: scene.creamMuted },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 20, paddingTop: 14 },
  pill: {
    height: 32,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pillText: { fontFamily: sceneFont.ui, ...scale.caption, color: scene.cream },
  amount: { paddingHorizontal: 20, paddingTop: 24, gap: 10 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // The minus is glass over the photograph; the plus is a button, so it is pomegranate.
  round: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: scene.glass,
    borderWidth: 1,
    borderColor: scene.glassEdge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundAccent: { backgroundColor: scene.pomegranate, borderColor: scene.pomegranate },
  qty: {
    fontFamily: sceneFont.uiHeavy,
    ...scale.headline,
    color: scene.cream,
    fontVariant: ['tabular-nums'],
  },
  amountSub: {
    fontFamily: sceneFont.ui,
    ...scale.caption,
    color: scene.creamMuted,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  lines: { gap: 6, paddingTop: 4 },
  line: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  // Cashback and the delivery fee: sums, so tabular figures.
  lineText: {
    fontFamily: sceneFont.uiText,
    ...scale.caption,
    color: scene.creamMuted,
    flex: 1,
    fontVariant: ['tabular-nums'],
  },
  section: { paddingHorizontal: 20, paddingTop: 24, gap: 10 },
  body: { fontFamily: sceneFont.italic, ...scale.lead, color: scene.creamMuted },
  // A glass card, not a pill: the paper corner.
  review: { borderRadius: radius.paper, padding: 12, gap: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, rowGap: 14, paddingTop: 4 },
  sign: { width: '47%', flexGrow: 1 },
  footer: { position: 'absolute', left: 20, right: 20 },
  cta: {
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: scene.pomegranate,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    ...shadow.paper,
  },
  ctaLabel: { fontFamily: sceneFont.display, ...scale.lead, color: scene.cream },
  ctaSum: {
    fontFamily: sceneFont.uiHeavy,
    ...scale.lead,
    color: scene.cream,
    fontVariant: ['tabular-nums'],
  },
});
