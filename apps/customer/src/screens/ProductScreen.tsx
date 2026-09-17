/**
 * One product as a scene: the photograph fills the screen, a kraft tag with
 * the name and the price hangs on it, the vendor says their line, and the
 * amount is set in the vendor's units (a melon, half a kilo of greens). What
 * the stall promises — weighing at the counter, freshness, haggling — sits as
 * pills; reviews and the rest of the counter follow, scrolling over the photo.
 */
import {
  arrivedToday,
  cashbackFor,
  estimateDelivery,
  tr,
  unitLabel,
} from '@bazar/storefront';
import type { MapStoreDto } from '@bazar/storefront';
import type { ProductDto, ReviewDto } from '@bazar/types';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Display,
  Eyebrow,
  Glass,
  Hand,
  Scene,
  SceneButton,
  Sign,
  scene,
  sceneFont,
  useSceneTop,
} from '@/components/bazar';
import { Bone } from '@/components/ui/Page';
import { useAddress } from '@/features/address/store';
import { useCart, useCartActions, useCartItem } from '@/features/cart/store';
import { getProduct, getStore, listProducts } from '@/lib/catalog';
import { useData } from '@/lib/use-data';
import { ArrowLeft, Heart, Leaf, Minus, Plus, Scale, Scooter, Star, Tag, Wallet, api, useLocale } from '@bazar/mobile';

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
    store && address ? estimateDelivery(store.point, address.point, store.preparationMinutes) : null;
  const siblings = useData(
    () => (product ? listProducts({ storeId: product.storeId }) : Promise.resolve([] as ProductDto[])),
    [product?.storeId],
  );
  const similar = useMemo(
    () =>
      (siblings ?? [])
        .filter((p) => p.id !== productId && p.available)
        .sort((a, b) => Number(b.categoryId === product?.categoryId) - Number(a.categoryId === product?.categoryId))
        .slice(0, 4),
    [siblings, productId, product?.categoryId],
  );
  const top = useSceneTop();

  if (!product)
    return (
      <View style={{ flex: 1, backgroundColor: scene.night, padding: 20, paddingTop: top + 60, gap: 12 }}>
        <Bone style={{ height: 240 }} />
        <Bone style={{ height: 32, width: 220 }} />
      </View>
    );
  return <ProductBody product={product} store={store ?? null} similar={similar} reviews={reviews} estimate={estimate} />;
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
  const units = unitLabel(locale);
  const unit = units[product.unit];
  const shownQty = quantity > 0 ? quantity : min;
  const lineTotal = product.price.amount * shownQty;
  const discount = product.oldPrice ? Math.round((1 - product.price.amount / product.oldPrice.amount) * 100) : 0;
  const description = product.description ? tr(product.description, locale) : '';
  const photo = product.images[0]?.url ?? null;
  const person = store?.ownerPhotoUrl ?? store?.coverUrl ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: scene.night }}>
      <Scene source={photo} style={StyleSheet.absoluteFill}>
        <View />
      </Scene>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: Math.round(height * 0.34), paddingBottom: 110 + insets.bottom }}
      >
        <View style={s.tagWrap}>
          <View style={s.tag}>
            <View style={s.tagHole} />
            <Text style={s.tagName}>{tr(product.name, locale)}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
              <Text style={s.tagPrice}>{t.money(product.price.amount, product.price.currency)}</Text>
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
          </View>
        </View>

        {store ? (
          <Pressable onPress={() => router.push(`/store/${store.id}`)} style={s.vendor}>
            {person ? (
              <Image source={{ uri: person }} style={s.avatar} contentFit="cover" cachePolicy="memory-disk" />
            ) : null}
            <View style={{ flex: 1, gap: 2 }}>
              {store.ownerMotto ? (
                <Hand size={22} numberOfLines={3}>
                  «{tr(store.ownerMotto, locale)}»
                </Hand>
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
                <I size={14} color={scene.saffron} />
                <Text style={s.pillText}>{String(label)}</Text>
              </Glass>
            );
          })}
        </View>

        <View style={s.amount}>
          <Eyebrow>{t('product.perUnit', { unit })}</Eyebrow>
          <View style={s.stepper}>
            <Pressable onPress={remove} disabled={quantity === 0} style={({ pressed }) => [s.round, quantity === 0 && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}>
              <Minus size={22} color={scene.cream} />
            </Pressable>
            <View style={{ alignItems: 'center', gap: 2, flex: 1 }}>
              <Hand size={42}>
                {t.qty(shownQty)} {unit}
              </Hand>
              <Text style={s.amountSub} numberOfLines={2}>
                {product.unit === 'KG' ? `${t('trust.weigh')} · ` : ''}
                {t.money(lineTotal)}
              </Text>
            </View>
            <Pressable onPress={add} style={({ pressed }) => [s.round, s.roundAccent, pressed && { opacity: 0.85 }]}>
              <Plus size={22} color={scene.ink} />
            </Pressable>
          </View>
          <View style={s.lines}>
            <View style={s.line}>
              <Wallet size={16} color={scene.saffron} />
              <Text style={s.lineText}>{t('product.cashback', { amount: t.money(cashbackFor(product.price.amount)) })}</Text>
            </View>
            {estimate ? (
              <View style={s.line}>
                <Scooter size={16} color={scene.saffron} />
                <Text style={s.lineText}>
                  {t('product.delivery', { minutes: estimate.etaMinutes, fee: t.money(estimate.fee.amount) })}
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
                    <Star key={n} size={12} color={scene.saffron} fill={n <= review.rating ? scene.saffron : 'transparent'} />
                  ))}
                </View>
                <Hand size={20} color={scene.creamMuted}>
                  «{review.comment}»
                </Hand>
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
                    onAdd={() => setQuantity(p.id, qty === 0 ? p.minQuantity || p.quantityStep || 1 : qty + (p.quantityStep || 1))}
                  />
                );
              })}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={[s.top, { top }]}>
        <SceneButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}>
          <ArrowLeft size={20} color={scene.ink} />
        </SceneButton>
        <SceneButton>
          <Heart size={20} color={scene.pomegranate} />
        </SceneButton>
      </View>

      <View style={[s.footer, { bottom: 24 + insets.bottom }]}>
        <Pressable
          onPress={() => (quantity > 0 ? router.push('/(tabs)/cart') : add())}
          style={({ pressed }) => [s.cta, pressed && { opacity: 0.92 }]}
        >
          <Text style={s.ctaLabel}>{quantity > 0 ? t('product.toCart') : t('product.addToCart')}</Text>
          <Display size={20}>{t.money(lineTotal)}</Display>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  top: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between' },
  tagWrap: { paddingHorizontal: 20, alignItems: 'flex-start' },
  tag: {
    backgroundColor: '#EBD8B4',
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    paddingVertical: 12,
    paddingLeft: 30,
    paddingRight: 20,
    gap: 2,
    maxWidth: '100%',
    transform: [{ rotate: '-2deg' }],
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  tagHole: { position: 'absolute', left: 11, top: '50%', marginTop: -5, width: 9, height: 9, borderRadius: 5, backgroundColor: scene.cream, borderWidth: 2, borderColor: '#B8975C' },
  tagName: { fontFamily: sceneFont.hand, fontSize: 30, lineHeight: 31, color: scene.ink },
  tagPrice: { fontFamily: sceneFont.hand, fontSize: 40, lineHeight: 42, color: scene.pomegranate },
  tagUnit: { fontFamily: sceneFont.hand, fontSize: 22, color: scene.inkSoft },
  tagOld: { fontFamily: sceneFont.hand, fontSize: 20, color: scene.inkSoft, textDecorationLine: 'line-through' },
  tagNote: { fontFamily: sceneFont.ui, fontSize: 12, color: scene.inkSoft, marginTop: 2 },
  vendor: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 22 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: scene.saffron, backgroundColor: '#3A2A1A' },
  vendorName: { fontFamily: sceneFont.ui, fontSize: 12, color: scene.creamMuted },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 20, paddingTop: 14 },
  pill: { height: 32, borderRadius: 16, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillText: { fontFamily: sceneFont.ui, fontSize: 12, color: scene.cream },
  amount: { paddingHorizontal: 20, paddingTop: 24, gap: 10 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  round: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(30,20,8,0.42)', borderWidth: 1, borderColor: 'rgba(251,241,222,0.3)', alignItems: 'center', justifyContent: 'center' },
  roundAccent: { backgroundColor: scene.saffron, borderColor: scene.saffron },
  amountSub: { fontFamily: sceneFont.ui, fontSize: 12, color: scene.creamMuted, textAlign: 'center' },
  lines: { gap: 6, paddingTop: 4 },
  line: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  lineText: { fontFamily: sceneFont.uiText, fontSize: 12, color: scene.creamMuted, flex: 1 },
  section: { paddingHorizontal: 20, paddingTop: 24, gap: 10 },
  body: { fontFamily: sceneFont.italic, fontSize: 17, lineHeight: 24, color: scene.creamMuted },
  review: { borderRadius: 14, padding: 12, gap: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, rowGap: 14, paddingTop: 4 },
  sign: { width: '47%', flexGrow: 1 },
  footer: { position: 'absolute', left: 20, right: 20 },
  cta: {
    height: 56,
    borderRadius: 18,
    backgroundColor: scene.pomegranate,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    shadowColor: scene.pomegranate,
    shadowOpacity: 0.6,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  ctaLabel: { fontFamily: sceneFont.uiHeavy, fontSize: 14, color: scene.cream },
});
