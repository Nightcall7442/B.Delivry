/**
 * «Избранное»: the stalls the customer keeps going back to, then their goods on the counter,
 * newest heart first. What is sold out today stays on the list (it is still the one they want),
 * faded, with «сегодня нет» and no «+»; a stall that has since been hidden simply is not shown.
 */
import { tr } from '@bazar/storefront';
import type { MapStoreDto } from '@bazar/storefront';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CartDisc,
  Display,
  Eyebrow,
  Say,
  Scene,
  SceneButton,
  scene,
  useSceneTop,
} from '@/components/bazar';
import { ProductTile, TILE_GAP, useTileWidth } from '@/components/shop/ProductTile';
import { Bone, LoadError } from '@/components/ui/Page';
import { useCartCount } from '@/features/cart/store';
import { useFavorites } from '@/features/favorites/store';
import { getStore, listProductsByIds } from '@/lib/catalog';
import { useLoad } from '@/lib/use-data';
import { ArrowLeft, Button, Heart, Photo, useAuth, useLocale } from '@bazar/mobile';

/** One page of the catalogue by id: the newest hearts are the ones that matter. */
const SHOWN = 100;

export function FavoritesScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const top = useSceneTop();
  const count = useCartCount();
  const { user, ready: authReady } = useAuth();
  const favorites = useFavorites();
  const tileWidth = useTileWidth();

  const productIds = favorites.product.slice(0, SHOWN);
  const storeIds = favorites.store.slice(0, SHOWN);
  const load = useLoad(async () => {
    const [products, stores] = await Promise.all([
      listProductsByIds(productIds),
      Promise.all(storeIds.map(getStore)),
    ]);
    return {
      products,
      stores: stores.filter((store): store is MapStoreDto => store !== null),
    };
  }, [productIds.join(','), storeIds.join(',')]);
  // In the order of the hearts, not of the catalogue.
  const products = useMemo(() => {
    const byId = new Map((load.data?.products ?? []).map((p) => [p.id, p]));
    return productIds.flatMap((id) => byId.get(id) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load.data, productIds.join(',')]);
  const stores = load.data?.stores ?? [];

  const body = () => {
    if (!authReady || (user && !favorites.ready)) return <Skeleton />;
    if (!user)
      return (
        <View style={s.pad}>
          <Say color={scene.creamMuted}>{t('fav.guest')}</Say>
          <Button
            label={t('common.signIn')}
            style={{ marginTop: 16 }}
            onPress={() => router.push({ pathname: '/login', params: { next: '/favorites' } })}
          />
        </View>
      );
    if (productIds.length === 0 && storeIds.length === 0)
      return (
        <View style={[s.pad, { gap: 8 }]}>
          <Display step="headline">{t('fav.emptyTitle')}</Display>
          <Say color={scene.creamMuted}>{t('fav.empty')}</Say>
        </View>
      );
    if (load.error && !load.data)
      return (
        <View style={s.pad}>
          <LoadError onRetry={() => void load.reload()} />
        </View>
      );
    if (!load.data) return <Skeleton />;
    return (
      <>
        {stores.length > 0 ? (
          <View style={s.section}>
            <Eyebrow>{t('fav.stores')}</Eyebrow>
            {stores.map((store) => (
              <StallRow key={store.id} store={store} />
            ))}
          </View>
        ) : null}
        {products.length > 0 ? (
          <View style={s.section}>
            <Eyebrow>{t('fav.products')}</Eyebrow>
            <View style={s.grid}>
              {products.map((product, i) => (
                <ProductTile
                  key={product.id}
                  product={product}
                  index={i}
                  style={{ width: tileWidth }}
                />
              ))}
            </View>
          </View>
        ) : null}
      </>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <Scene source={null} style={StyleSheet.absoluteFill}>
        {null}
      </Scene>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: top + 64, paddingBottom: 40 + insets.bottom }}
      >
        <View style={s.pad}>
          <Display>{t('fav.title')}</Display>
        </View>
        {body()}
      </ScrollView>

      <View style={[s.top, { top }]}>
        <SceneButton
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          label={t('common.back')}
        >
          <ArrowLeft size={20} color={scene.ink} />
        </SceneButton>
        <CartDisc count={count} onPress={() => router.push('/(tabs)/cart')} />
      </View>
    </View>
  );
}

function StallRow({ store }: { store: MapStoreDto }) {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { set } = useFavorites();
  const person = store.ownerPhotoUrl ?? store.coverUrl;
  return (
    <View style={s.stall}>
      <Pressable
        onPress={() => router.push(`/store/${store.id}`)}
        style={({ pressed }) => [s.stallMain, pressed && { opacity: 0.8 }]}
        accessibilityRole="link"
      >
        {person ? <Photo uri={person} style={s.avatar} /> : null}
        <View style={{ flex: 1, gap: 1 }}>
          <Display step="title" numberOfLines={1}>
            {store.ownerName ?? tr(store.name, locale)}
          </Display>
          <Eyebrow>
            {[
              store.standNumber ?? tr(store.name, locale),
              store.reviewCount > 0 ? `★ ${store.rating.toFixed(1)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Eyebrow>
        </View>
      </Pressable>
      <Pressable
        onPress={() => void set('store', store.id, false)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t('fav.forget')}
      >
        <Heart size={20} color={scene.pomegranate} fill={scene.pomegranate} />
      </Pressable>
    </View>
  );
}

function Skeleton() {
  return (
    <View style={[s.pad, { gap: 12, marginTop: 16 }]}>
      <Bone style={{ height: 44, width: 240 }} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Bone style={{ flex: 1, height: 120 }} />
        <Bone style={{ flex: 1, height: 120 }} />
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
    alignItems: 'center',
  },
  pad: { paddingHorizontal: 20 },
  section: { paddingHorizontal: 20, paddingTop: 24, gap: 12 },
  stall: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stallMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: scene.ochre,
    backgroundColor: scene.kraft,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP, rowGap: 18 },
});
