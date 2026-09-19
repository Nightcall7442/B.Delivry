/**
 * A stall as a scene: the morning counter photo fills the screen, the person
 * behind it and their line sit on it, then everything on the counter as
 * cardboard signs — all of it, scrolling over the photo. Tapping the photo
 * opens it full-size (the "counter now" story); the cart pill floats.
 */
import { arrivedToday, estimateDelivery, tr, unitLabel } from '@bazar/storefront';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StoryViewer } from '@/components/shop/Stories';
import {
  BasketGlyph,
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
import { Bone, LoadError } from '@/components/ui/Page';
import { useAddress } from '@/features/address/store';
import { useCart, useCartActions } from '@/features/cart/store';
import { getStore, listCategories, listProducts } from '@/lib/catalog';
import { EMPTY, useList, useLoad } from '@/lib/use-data';
import { ArrowLeft, Clock, Heart, Scooter, Star, useLocale } from '@bazar/mobile';

export function StoreScreen({ storeId }: { storeId: string }) {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { address } = useAddress();
  const { quantities } = useCart();
  const { setQuantity } = useCartActions();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const top = useSceneTop();
  const [category, setCategory] = useState<string | null>(null);
  const [story, setStory] = useState(false);

  const storeLoad = useLoad(() => getStore(storeId), [storeId]);
  const productLoad = useLoad(() => listProducts({ storeId }), [storeId]);
  const store = storeLoad.data;
  const products = productLoad.data ?? EMPTY;
  const categories = useList(() => listCategories(), []);
  const units = unitLabel(locale);

  const present = useMemo(() => {
    const ids = new Set(products.map((p) => p.categoryId));
    return categories.filter((c) => ids.has(c.id));
  }, [products, categories]);
  const shown = (category ? products.filter((p) => p.categoryId === category) : products).filter(
    (p) => p.available,
  );
  const inCart = products.filter((p) => quantities[p.id]);
  const total = inCart.reduce((sum, p) => sum + p.price.amount * (quantities[p.id] ?? 0), 0);
  const estimate =
    store && address
      ? estimateDelivery(store.point, address.point, store.preparationMinutes)
      : null;
  const hero = store?.counterPhotoUrl ?? store?.coverUrl ?? null;
  const person = store?.ownerPhotoUrl ?? null;
  const takenAt = store?.counterPhotoAt
    ? new Date(store.counterPhotoAt).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Tashkent',
      })
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: scene.night }}>
      <Scene source={hero} style={StyleSheet.absoluteFill}>
        <View />
      </Scene>

      {store ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: Math.round(height * 0.36),
            paddingBottom: 120 + insets.bottom,
          }}
        >
          <Pressable
            onPress={() => hero && setStory(true)}
            style={{ height: Math.round(height * 0.2) }}
            accessibilityRole="button"
            accessibilityLabel={t('store.counterNow')}
          />
          <View style={s.person}>
            <Eyebrow>
              {[
                store.standNumber,
                store.ownerSince ? t('store.ownerSince', { year: store.ownerSince }) : null,
              ]
                .filter(Boolean)
                .join(' · ') || tr(store.name, locale)}
            </Eyebrow>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {store.ownerName ? (
                <View style={s.avatar}>
                  <Text style={s.avatarInitial}>{store.ownerName.slice(0, 1)}</Text>
                  {person ? (
                    <Image
                      source={{ uri: person }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : null}
                </View>
              ) : null}
              <Display size={store.ownerName ? 40 : 32} style={{ flex: 1 }} numberOfLines={2}>
                {store.ownerName ?? tr(store.name, locale)}
              </Display>
            </View>
            {store.ownerName ? (
              <Text style={s.storeName} numberOfLines={1}>
                {tr(store.name, locale)}
              </Text>
            ) : null}
            {store.ownerMotto ? (
              <Hand size={25} numberOfLines={3}>
                «{tr(store.ownerMotto, locale)}»
              </Hand>
            ) : store.description ? (
              <Hand size={22} color={scene.creamMuted} numberOfLines={2}>
                {tr(store.description, locale)}
              </Hand>
            ) : null}
            <View style={s.pills}>
              <Glass style={s.pill}>
                <Star size={14} color={scene.saffron} fill={scene.saffron} />
                <Text style={s.pillText}>
                  {store.rating.toFixed(1)}
                  {store.reviewCount ? ` · ${store.reviewCount}` : ''}
                </Text>
              </Glass>
              <Glass style={s.pill}>
                <Clock size={14} color={scene.cream} />
                <Text style={s.pillText}>
                  {estimate
                    ? t('common.eta', { minutes: estimate.etaMinutes })
                    : t('store.prep', { minutes: store.preparationMinutes })}
                </Text>
              </Glass>
              {estimate ? (
                <Glass style={s.pill}>
                  <Scooter size={14} color={scene.cream} />
                  <Text style={s.pillText}>
                    {t('store.delivery', { fee: t.money(estimate.fee.amount) })}
                  </Text>
                </Glass>
              ) : null}
            </View>
            {!store.isOpen ? <Text style={s.closed}>{t('store.closedHint')}</Text> : null}
          </View>

          <View style={s.counter}>
            <Eyebrow>
              {t('scene.onCounter')}
              {store.counterPhotoUrl && takenAt
                ? ` · ${t('scene.counterPhotoAt', { time: takenAt })}`
                : ''}
            </Eyebrow>
            {present.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.chips}
                style={{ marginHorizontal: -20 }}
              >
                <Pressable onPress={() => setCategory(null)}>
                  <Glass style={[s.chip, category === null && s.chipOn]}>
                    <Text style={[s.chipText, category === null && s.chipTextOn]}>
                      {t('common.all')}
                    </Text>
                  </Glass>
                </Pressable>
                {present.map((c) => (
                  <Pressable key={c.id} onPress={() => setCategory(c.id)}>
                    <Glass style={[s.chip, category === c.id && s.chipOn]}>
                      <Text style={[s.chipText, category === c.id && s.chipTextOn]}>
                        {tr(c.name, locale)}
                      </Text>
                    </Glass>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <View style={s.grid}>
              {shown.map((product, i) => {
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
                    countLabel={t('scene.inCart', {
                      count: `${t.qty(qty)} ${units[product.unit]}`,
                    })}
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
              })}
            </View>
          </View>
        </ScrollView>
      ) : storeLoad.error ? (
        <View style={{ padding: 20, paddingTop: top + 60 }}>
          <LoadError onRetry={() => void Promise.all([storeLoad.reload(), productLoad.reload()])} />
        </View>
      ) : (
        <View style={{ padding: 20, paddingTop: Math.round(height * 0.4), gap: 12 }}>
          <Bone style={{ height: 40, width: 200 }} />
          <Bone style={{ height: 24, width: 280 }} />
        </View>
      )}

      {story && store ? (
        <StoryViewer stores={[store]} start={0} cta={false} onClose={() => setStory(false)} />
      ) : null}

      <View style={[s.top, { top }]}>
        <SceneButton
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        >
          <ArrowLeft size={20} color={scene.ink} />
        </SceneButton>
        <SceneButton>
          <Heart size={20} color={scene.pomegranate} />
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
              {tr(store?.name ?? null, locale)}
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
  },
  person: { paddingHorizontal: 20, gap: 8 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    borderColor: scene.saffron,
    backgroundColor: '#3A2A1A',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontFamily: sceneFont.display, fontSize: 22, color: scene.saffronLight },
  storeName: { fontFamily: sceneFont.ui, fontSize: 13, color: scene.creamMuted, marginTop: -2 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  pill: {
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pillText: { fontFamily: sceneFont.ui, fontSize: 12, color: scene.cream },
  closed: { fontFamily: sceneFont.ui, fontSize: 12, color: scene.saffronLight },
  counter: { paddingHorizontal: 20, paddingTop: 22, gap: 12 },
  chips: { paddingHorizontal: 20, gap: 6 },
  chip: { height: 32, borderRadius: 16, paddingHorizontal: 12, justifyContent: 'center' },
  chipOn: { backgroundColor: scene.cream, borderColor: scene.cream },
  chipText: { fontFamily: sceneFont.ui, fontSize: 12, color: scene.cream },
  chipTextOn: { color: scene.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, rowGap: 14, paddingTop: 4 },
  sign: { width: '47%', flexGrow: 1 },
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
