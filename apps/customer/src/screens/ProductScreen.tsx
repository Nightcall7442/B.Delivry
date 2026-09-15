/**
 * One product: the picture large on a soft ground, name, rating, price with
 * the old price and the discount, the stall it comes from, a description,
 * similar goods, and a sticky stepper + "В корзину".
 */
import {
  arrivedToday,
  cashbackFor,
  estimateDelivery,
  tagLabel,
  tr,
  unitLabel,
} from '@bazar/storefront';
import type { ProductDto, ReviewDto } from '@bazar/types';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ProductTile } from '@/components/shop/ProductTile';
import { Card, Page, SectionHead, ui } from '@/components/ui/Page';
import { useAddress } from '@/features/address/store';
import { useCartItem } from '@/features/cart/store';
import { getProduct, getStore, listProducts } from '@/lib/catalog';
import { useData } from '@/lib/use-data';
import {
  Button,
  Chevron,
  Leaf,
  Minus,
  Photo,
  Plus,
  Scale,
  Star,
  Tag,
  Text,
  api,
  color,
  useLocale,
  Wallet,
  Scooter,
} from '@bazar/mobile';

export function ProductScreen({ productId }: { productId: string }) {
  const { locale } = useLocale();
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
        .slice(0, 6),
    [siblings, productId, product?.categoryId],
  );

  if (!product)
    return (
      <Page back="history" cart>
        {null}
      </Page>
    );
  return (
    <ProductBody
      product={product}
      storeName={store ? tr(store.name, locale) : null}
      similar={similar}
      reviews={reviews}
      estimate={estimate}
    />
  );
}

function ProductBody({
  product,
  storeName,
  similar,
  reviews,
  estimate,
}: {
  product: ProductDto;
  storeName: string | null;
  similar: ProductDto[];
  reviews: ReviewDto[];
  estimate: { etaMinutes: number; fee: { amount: number } } | null;
}) {
  const router = useRouter();
  const { locale, t } = useLocale();
  const step = product.quantityStep || 1;
  const min = product.minQuantity || step;
  const { quantity, add, remove } = useCartItem(product.id, step, min);
  const unit = unitLabel(locale)[product.unit];
  const discount = product.oldPrice
    ? Math.round((1 - product.price.amount / product.oldPrice.amount) * 100)
    : 0;
  const description = product.description ? tr(product.description, locale) : '';
  const scrollY = useRef(new Animated.Value(0)).current;

  return (
    <Page
      back="history"
      cart
      floating
      scrollY={scrollY}
      footer={
        <View style={s.footer}>
          <View style={s.stepper}>
            <Pressable onPress={remove} style={s.step} hitSlop={6} disabled={quantity === 0}>
              <Minus
                size={18}
                color={quantity === 0 ? color.inkFaint : color.ink}
                strokeWidth={2.4}
              />
            </Pressable>
            <Text role="title" style={{ minWidth: 48, textAlign: 'center', fontSize: 15 }}>
              {t.qty(quantity === 0 ? min : quantity)} {unit}
            </Text>
            <Pressable onPress={add} style={s.step} hitSlop={6}>
              <Plus size={18} color={color.ink} strokeWidth={2.4} />
            </Pressable>
          </View>
          <Button
            label={quantity > 0 ? t('product.toCart') : t('product.addToCart')}
            trailing={t.money(product.price.amount * (quantity || min))}
            style={{ flex: 1, justifyContent: 'space-between', paddingHorizontal: 18 }}
            onPress={quantity > 0 ? () => router.push('/cart') : add}
            disabled={!product.available}
          />
        </View>
      }
    >
      <View style={s.hero}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              transform: [
                {
                  translateY: scrollY.interpolate({
                    inputRange: [-300, 0, 380],
                    outputRange: [-150, 0, 190],
                    extrapolate: 'clamp',
                  }),
                },
                {
                  scale: scrollY.interpolate({
                    inputRange: [-300, 0],
                    outputRange: [1.8, 1],
                    extrapolate: 'clamp',
                  }),
                },
              ],
            },
          ]}
        >
          <Photo
            uri={product.images[0]?.url}
            style={s.heroPhoto}
            priority="high"
            sharedTag={`product-${product.id}`}
            fallback={<Leaf size={64} color={color.sand300} />}
          />
        </Animated.View>
        <LinearGradient
          colors={['rgba(0,0,0,0.18)', 'rgba(0,0,0,0)']}
          style={s.heroShade}
          pointerEvents="none"
        />
        {discount ? (
          <View style={[s.badge, { backgroundColor: color.danger }]}>
            <Text role="caption" style={s.badgeText}>
              −{discount}%
            </Text>
          </View>
        ) : arrivedToday(product) ? (
          <View style={[s.badge, { backgroundColor: ui.brand }]}>
            <Text role="caption" style={s.badgeText}>
              {t('store.arrivedToday')}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={{ marginTop: 16, gap: 6 }}>
        <Text role="display" style={{ fontSize: 24, lineHeight: 30 }}>
          {tr(product.name, locale)}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Star size={14} color={color.saffron500} fill={color.saffron500} strokeWidth={2} />
            <Text role="caption" style={{ color: color.ink, fontWeight: '600' }}>
              {product.rating.toFixed(1)}
            </Text>
            <Text role="caption">({product.reviewCount})</Text>
          </View>
          {product.tags[0] ? (
            <View style={s.chip}>
              <Text role="caption" style={{ color: ui.brandDeep, fontWeight: '600' }}>
                {tagLabel(locale)[product.tags[0]]}
              </Text>
            </View>
          ) : null}
          {product.stock !== null && product.stock <= 10 ? (
            <Text role="caption" style={{ color: color.danger }}>
              {t('store.left', { count: product.stock ?? 0 })}
            </Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
          <Text role="display" style={{ fontSize: 26, color: ui.brandDeep }}>
            {t.money(product.price.amount)}
          </Text>
          {product.oldPrice ? (
            <Text
              role="muted"
              style={{ textDecorationLine: 'line-through', color: color.inkFaint }}
            >
              {t.money(product.oldPrice.amount)}
            </Text>
          ) : null}
          <Text role="caption">{t('product.perUnit', { unit })}</Text>
        </View>
      </View>

      {cashbackFor(product.price.amount) > 0 || estimate ? (
        <View style={s.facts}>
          {cashbackFor(product.price.amount) > 0 ? (
            <View style={s.fact}>
              <Wallet size={20} color={color.brand600} />
              <Text role="muted" style={s.factText}>
                {t('product.cashback', { amount: t.money(cashbackFor(product.price.amount)) })}
              </Text>
            </View>
          ) : null}
          {estimate ? (
            <View style={s.fact}>
              <Scooter size={20} color={color.brand600} />
              <Text role="muted" style={s.factText}>
                {t('product.delivery', {
                  minutes: estimate.etaMinutes,
                  fee: t.money(estimate.fee.amount),
                })}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={s.trust}>
        {(
          [
            [Scale, t('trust.weigh')],
            [Leaf, t('trust.fresh')],
            [Tag, t('trust.haggle')],
          ] as const
        ).map(([Icon, label]) => (
          <View key={label} style={s.trustItem}>
            <View style={s.trustIcon}>
              <Icon size={16} color={ui.brandDeep} strokeWidth={2.2} />
            </View>
            <Text role="caption" numberOfLines={2} style={s.trustText}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      {storeName ? (
        <Pressable
          onPress={() =>
            router.push({ pathname: '/store/[storeId]', params: { storeId: product.storeId } })
          }
        >
          <Card style={s.storeRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text role="caption">{t('product.store')}</Text>
              <Text role="body" numberOfLines={1} style={{ fontWeight: '600' }}>
                {storeName}
              </Text>
            </View>
            <Chevron size={20} color={color.inkFaint} />
          </Card>
        </Pressable>
      ) : null}

      {description ? (
        <>
          <SectionHead title={t('product.about')} />
          <Text role="muted" style={{ color: color.ink, lineHeight: 22 }}>
            {description}
          </Text>
        </>
      ) : null}

      {reviews.length > 0 ? (
        <>
          <SectionHead title={t('product.reviews')} />
          <View style={{ gap: 10 }}>
            {reviews.map((review) => (
              <Card key={review.id} style={s.review}>
                <View style={s.reviewHead}>
                  <View style={s.reviewAvatar}>
                    <Text role="caption" style={{ color: ui.brandDeep, fontWeight: '700' }}>
                      {review.authorName.slice(0, 1)}
                    </Text>
                  </View>
                  <Text role="body" style={{ flex: 1, fontWeight: '600', fontSize: 14 }}>
                    {review.authorName}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 2 }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        size={12}
                        color={n <= review.rating ? color.saffron500 : color.lineStrong}
                        fill={n <= review.rating ? color.saffron500 : 'none'}
                        strokeWidth={2}
                      />
                    ))}
                  </View>
                </View>
                <Text role="muted" style={{ color: color.ink, lineHeight: 20 }}>
                  {review.comment}
                </Text>
                {review.reply ? (
                  <Text role="caption" style={{ marginTop: 6 }}>
                    ↳ {review.reply}
                  </Text>
                ) : null}
              </Card>
            ))}
          </View>
        </>
      ) : null}

      {similar.length > 0 ? (
        <>
          <SectionHead title={t('product.similar')} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -16 }}
            contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingBottom: 12 }}
          >
            {similar.map((p) => (
              <ProductTile key={p.id} product={p} compact />
            ))}
          </ScrollView>
        </>
      ) : null}
    </Page>
  );
}

const s = StyleSheet.create({
  hero: {
    marginHorizontal: -16,
    height: 380,
    backgroundColor: ui.mintDeep,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...ui.shadow,
  },
  heroPhoto: { width: '100%', height: '100%' },
  heroShade: { position: 'absolute', left: 0, right: 0, top: 0, height: 120 },
  badge: {
    position: 'absolute',
    left: 16,
    bottom: 16,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: { color: color.white, fontSize: 12, lineHeight: 14, fontWeight: '700' },
  chip: {
    backgroundColor: ui.brandSoft,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  facts: { marginTop: 14, gap: 8 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  factText: { flex: 1, color: color.ink },
  review: { padding: ui.pad, gap: 8 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ui.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trust: { flexDirection: 'row', gap: 8, marginTop: 14 },
  trustItem: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    backgroundColor: color.tile,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  trustIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: color.raise,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustText: {
    textAlign: 'center',
    color: ui.brandDeep,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '600',
  },
  storeRow: {
    marginTop: 14,
    padding: ui.pad,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.field,
    borderRadius: 28,
    height: 56,
    paddingHorizontal: 4,
  },
  step: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
});
