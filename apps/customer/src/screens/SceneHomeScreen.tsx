/**
 * The front door as a walk into the bazaar: one photograph of the rows fills
 * the screen, the greeting sits on it, then the people who are at their
 * counters right now, today's honest discounts, the rows to walk along, and everything on the
 * counters today as cardboard signs you can take straight into the basket. Morning and
 * evening are the same screen in different light. No tab bar — the row is the
 * navigation, the basket is a disc that turns into «Оформить» once it has
 * something in it, the profile is the initial in the corner.
 */
import {
  arrivedToday,
  chorsuTemperature,
  closesToday,
  dealsOf,
  degrees,
  isShopfront,
  productLineTotal,
  shopfronts,
  stallGoods,
  tr,
} from '@bazar/storefront';
import { haversineMeters } from '@bazar/maps';
import type { CategoryDto, LatLngDto, ProductDto } from '@bazar/types';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BasketGlyph,
  CartDisc,
  Display,
  Eyebrow,
  Glass,
  KraftTag,
  RowSign,
  SHADOW_REACH,
  Scene,
  isEvening,
  SceneButton,
  Say,
  SceneHead,
  ShopSign,
  VendorCard,
  scene,
  sceneFont,
  useSceneTop,
} from '@/components/bazar';
import { PriceBoard } from '@/components/prices/PriceBoard';
import { ProductTile, useTileWidth } from '@/components/shop/ProductTile';
import { LoadError } from '@/components/ui/Page';
import { DEFAULT_POINT, useAddress } from '@/features/address/store';
import { useDeliverable } from '@/features/address/zone';
import { useCart } from '@/features/cart/store';
import { REACH_METERS, listCategories, listProducts, listStores } from '@/lib/catalog';
import { EMPTY, useLoad } from '@/lib/use-data';
import { Bell, Mic, api, radius, scale, shadow, useAuth, useLocale } from '@bazar/mobile';

const TILTS = [-1.5, 1, -1, 1.5, -1, 1];
/** A discount card on the rail: a little narrower than half the screen, so the next one peeks. */
const DEAL_WIDTH = 156;

/**
 * Whether the phone is out of reach of the address the counters are shown for — a pin left in
 * Tashkent, a trip to Khorezm. Reads the fix only when location is already allowed: the home
 * screen never asks for it.
 */
function useAwayFrom(here: LatLngDto): boolean {
  const [away, setAway] = useState(false);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        if (!(await Location.getForegroundPermissionsAsync()).granted) return;
        const fix = await Location.getLastKnownPositionAsync({ maxAge: 30 * 60_000 });
        if (!fix || !live) return;
        const phone = { lat: fix.coords.latitude, lng: fix.coords.longitude };
        setAway(haversineMeters(phone, here) > REACH_METERS);
      } catch {
        // No fix, no nudge.
      }
    })();
    return () => {
      live = false;
    };
  }, [here.lat, here.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return away;
}

/** The space between two rows of the counter. */
const RowGap = () => <View style={{ height: 18 }} />;

export function SceneHomeScreen() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { user } = useAuth();
  const { address } = useAddress();
  const insets = useSafeAreaInsets();
  const top = useSceneTop();
  const { quantities } = useCart();
  const here = address?.point ?? DEFAULT_POINT;
  const storeLoad = useLoad(() => listStores(here), [here.lat, here.lng]);
  // No address yet, or the phone is in another city: the counters below are someone else's.
  const away = useAwayFrom(here);
  // Go Bazar's «we are not operating in your location», said here rather than at checkout.
  const deliverable = useDeliverable(address?.point);
  const nudge = !address
    ? 'scene.whereAreYou'
    : deliverable === false
      ? 'scene.outOfZone'
      : away
        ? 'scene.awayFromAddress'
        : null;
  const categoryLoad = useLoad(() => listCategories(), []);
  const productLoad = useLoad(() => listProducts(), []);
  const dealLoad = useLoad(() => listProducts({ onSale: true }), []);
  const evening = isEvening();
  // The tag's temperature is the real one at Chorsu or nothing — never a number from the code.
  const [temperature, setTemperature] = useState<number | null>(null);
  useEffect(() => {
    void chorsuTemperature().then(setTemperature);
  }, []);

  const stores = storeLoad.data ?? EMPTY;
  const categories = categoryLoad.data ?? EMPTY;
  // «Индекс базара» of the address's own city: the city of the stalls around it.
  const cityId = stores.find((store) => !isShopfront(store))?.cityId;
  const priceLoad = useLoad(
    () => (cityId === undefined ? Promise.resolve(null) : api().catalog.priceIndex(cityId)),
    [cityId],
  );
  // People first: the stalls, open ones leading. Shops are buildings and get their own rail.
  const vendors = useMemo(
    () =>
      stores
        .filter((store) => !isShopfront(store))
        .sort(
          (a, b) =>
            Number(b.isOpen) - Number(a.isOpen) || Number(!!b.ownerName) - Number(!!a.ownerName),
        ),
    [stores],
  );
  // One board per chain — the branch nearest the address takes the order.
  const shops = useMemo(() => shopfronts(stores, address?.point ?? null), [stores, address]);
  // What is on the counters: this morning's arrivals first, then the rest, stalls interleaved.
  const counter = useMemo(() => {
    // Stall goods only — shop shelves live behind their boards. Open stalls lead; after
    // closing time the counters still show what they had, never the supermarket's water.
    const open = new Set(stores.filter((s) => s.isOpen && !isShopfront(s)).map((s) => s.id));
    const fresh = (p: ProductDto) => Number(arrivedToday(p));
    return stallGoods(productLoad.data ?? EMPTY, stores)
      .filter((p) => p.available && (open.size === 0 || open.has(p.storeId)))
      .sort((a, b) => fresh(b) - fresh(a) || a.storeId.localeCompare(b.storeId));
  }, [productLoad.data, stores]);
  // «Скидки»: the city's goods on sale, deepest cut first, a few per stall.
  const deals = useMemo(() => {
    const here = new Set(stores.map((store) => store.id));
    return dealsOf((dealLoad.data ?? EMPTY).filter((p) => here.has(p.storeId)));
  }, [dealLoad.data, stores]);
  // The basket bar counts what is on this screen: the counters and the discounts, once each.
  const shown = useMemo(() => {
    const ids = new Set(counter.map((p) => p.id));
    return [...counter, ...deals.filter((p) => !ids.has(p.id))];
  }, [counter, deals]);
  const inCart = shown.filter((p) => quantities[p.id]);
  // As the order will charge it: a quantity price counts.
  const total = inCart.reduce((sum, p) => sum + productLineTotal(p, quantities[p.id] ?? 0), 0);
  const count = inCart.length;
  const stalls = new Set(inCart.map((p) => p.storeId));
  // One stall goes straight to checkout; several — the receipts decide how many trips it is.
  const checkout = () =>
    stalls.size === 1
      ? router.push({ pathname: '/checkout', params: { store: [...stalls][0] ?? '', stores: '' } })
      : router.push('/(tabs)/cart');

  const dateLine = new Intl.DateTimeFormat(locale === 'uz' ? 'uz-Latn-UZ' : 'ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Tashkent',
  }).format(new Date());
  const failed = !storeLoad.data && storeLoad.error;
  // Two to a row, like signs on a counter; the last odd one keeps its half.
  const cardWidth = useTileWidth();
  const renderProduct = ({ item: product, index: i }: ListRenderItemInfo<ProductDto>) => {
    const stall = stores.find((store) => store.id === product.storeId);
    return (
      <ProductTile
        product={product}
        index={i}
        stall={stall ? (stall.ownerName ?? tr(stall.name, locale)) : undefined}
        style={{ width: cardWidth }}
      />
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {/* The photograph of the rows hangs at the door (the login); here the hall is the ground. */}
      <Scene source={null} style={StyleSheet.absoluteFill}>
        {null}
      </Scene>

      {/* The counter is a virtualized grid (a hundred cards used to be built and drawn at once);
          the greeting and the rails are its header. */}
      <FlatList
        data={counter}
        keyExtractor={(product) => product.id}
        numColumns={2}
        renderItem={renderProduct}
        columnWrapperStyle={s.row}
        ItemSeparatorComponent={RowGap}
        initialNumToRender={6}
        maxToRenderPerBatch={4}
        windowSize={5}
        showsVerticalScrollIndicator={false}
        // Room under the tag row, as on the web: at night the lamps hang in it, not over the date.
        contentContainerStyle={{ paddingTop: top + 80, paddingBottom: 110 + insets.bottom }}
        ListHeaderComponent={
          <>
            <View style={s.greeting}>
              <Eyebrow>
                {capitalize(dateLine)} · {t(evening ? 'scene.eveningLine' : 'scene.morningLine')}
              </Eyebrow>
              <Display italic={evening}>
                {t(evening ? 'scene.evening' : 'scene.morning')}
                {user?.firstName ? `,\n${user.firstName}` : ''}
              </Display>
            </View>

            {nudge ? (
              <Glass
                style={s.nudge}
                // Away from the address: find the phone. Out of zone: pick another address.
                onPress={() =>
                  router.push({
                    pathname: '/address',
                    params: nudge === 'scene.outOfZone' ? {} : { locate: '1' },
                  })
                }
              >
                <Text style={s.nudgeText}>{t(nudge)} →</Text>
              </Glass>
            ) : null}
            {failed ? (
              <View style={{ paddingHorizontal: 20 }}>
                <LoadError onRetry={() => void storeLoad.reload()} />
              </View>
            ) : null}
            {priceLoad.data && priceLoad.data.items.length > 0 ? (
              <PriceBoard
                index={priceLoad.data}
                onPress={() =>
                  router.push({
                    pathname: '/prices',
                    params: { city: priceLoad.data!.city?.id ?? '' },
                  })
                }
              />
            ) : null}
            <View style={{ height: 28 }} />

            <SceneHead
              title={t('scene.vendorsHere')}
              action={t('scene.vendorsAll', { count: stores.length })}
              onAction={() => router.push('/(tabs)/categories')}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.rail}
              contentContainerStyle={s.vendors}
            >
              {vendors.map((store) => (
                <VendorCard
                  key={store.id}
                  photo={store.ownerPhotoUrl ?? store.counterPhotoUrl ?? store.coverUrl}
                  name={store.ownerName ?? tr(store.name, locale)}
                  line={store.ownerMotto ? shortLine(tr(store.ownerMotto, locale)) : null}
                  onPress={() => router.push(`/store/${store.id}`)}
                />
              ))}
            </ScrollView>

            {deals.length > 0 ? (
              <>
                <SceneHead
                  title={t('deals.title')}
                  action={t('deals.all')}
                  onAction={() =>
                    router.push({ pathname: '/search', params: { sort: 'discount' } })
                  }
                />
                <Say step="lead" color={scene.creamMuted} style={s.dealsHint}>
                  {t('deals.honest')}
                </Say>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={s.rail}
                  contentContainerStyle={s.deals}
                >
                  {deals.map((product, i) => (
                    <ProductTile
                      key={product.id}
                      product={product}
                      index={i}
                      style={{ width: DEAL_WIDTH }}
                    />
                  ))}
                </ScrollView>
              </>
            ) : null}

            {shops.length > 0 ? (
              <>
                <SceneHead title={t('shop.nearby')} />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={s.rail}
                  contentContainerStyle={s.vendors}
                >
                  {shops.map((store) => {
                    const closes = closesToday(store);
                    return (
                      <ShopSign
                        key={store.id}
                        name={tr(store.name, locale)}
                        logo={store.logoUrl}
                        line={closes ? t('shop.until', { time: closes }) : t('shop.closedToday')}
                        onPress={() => router.push(`/store/${store.id}`)}
                      />
                    );
                  })}
                </ScrollView>
              </>
            ) : null}

            <SceneHead
              title={t('scene.walkRow')}
              action={t('scene.rowsAll')}
              onAction={() => router.push('/(tabs)/categories')}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.rail}
              contentContainerStyle={s.rows}
            >
              {categories.slice(0, 6).map((category: CategoryDto, index) => (
                <RowSign
                  key={category.id}
                  title={tr(category.name, locale)}
                  tilt={TILTS[index % TILTS.length] as number}
                  onPress={() =>
                    router.push({
                      pathname: '/ryad/[categoryId]',
                      params: { categoryId: category.id },
                    })
                  }
                />
              ))}
            </ScrollView>

            <SceneHead
              title={t('scene.onCounterToday')}
              action={t('scene.rowsAll')}
              onAction={() => router.push('/(tabs)/categories')}
            />
            {/* The grid's own top room. */}
            <View style={{ height: 6 }} />
          </>
        }
      />

      <View style={[s.top, { top }]}>
        <KraftTag>
          {temperature !== null
            ? `Чорсу · ${evening ? 'вечер' : 'утро'} · ${degrees(temperature)}`
            : evening
              ? 'Чорсу · вечер · до 21:00'
              : 'Чорсу · утро'}
        </KraftTag>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <SceneButton onPress={() => router.push('/(tabs)/orders')}>
            <Bell size={20} color={scene.pomegranate} />
          </SceneButton>
          <SceneButton onPress={() => router.push('/(tabs)/profile')}>
            <Text style={s.initial}>{(user?.firstName ?? 'А').slice(0, 1).toUpperCase()}</Text>
          </SceneButton>
        </View>
      </View>

      <View style={[s.bottom, { bottom: 24 + insets.bottom }]}>
        {count > 0 ? (
          <>
            <Pressable
              onPress={checkout}
              style={({ pressed }) => [s.checkout, pressed && { opacity: 0.92 }]}
            >
              <BasketGlyph color={scene.cream} size={22} />
              <View style={{ flex: 1 }}>
                <Text style={s.checkoutTitle}>{t('cart.checkout')}</Text>
                <Text style={s.checkoutSub} numberOfLines={1}>
                  {t.n('cart.items', count)} · {t.money(total)}
                </Text>
              </View>
              <Text style={s.checkoutArrow}>→</Text>
            </Pressable>
            <Glass style={s.mic} onPress={() => router.push('/list')}>
              <Mic size={22} color={scene.ochreLight} />
            </Glass>
          </>
        ) : (
          <>
            <Glass style={s.voice} onPress={() => router.push('/list')}>
              <Mic size={22} color={scene.ochreLight} />
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={s.voiceTitle}>{t(evening ? 'scene.sayEvening' : 'scene.say')}</Text>
                <Text style={s.voiceHint} numberOfLines={1}>
                  {t('scene.sayHint')}
                </Text>
              </View>
            </Glass>
            <CartDisc count={0} onPress={() => router.push('/(tabs)/cart')} />
          </>
        )}
      </View>
    </View>
  );
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The motto is a sentence; the card has room for four words of it. */
function shortLine(text: string): string {
  const words = text.replace(/[.!…]+$/, '').split(' ');
  return words.length <= 4 ? words.join(' ') : `${words.slice(0, 4).join(' ')}…`;
}

const s = StyleSheet.create({
  top: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 2,
  },
  initial: { fontFamily: sceneFont.display, ...scale.title, color: scene.pomegranate },
  greeting: { paddingHorizontal: 20, gap: 6 },
  nudge: {
    marginHorizontal: 20,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.pill,
  },
  nudgeText: { fontFamily: sceneFont.uiText, ...scale.body, color: scene.ink },
  // The rails keep room for their cards' shadow and hand it back, so the rhythm stays.
  rail: { marginBottom: -SHADOW_REACH },
  vendors: { paddingHorizontal: 20, gap: 10, paddingBottom: 8 + SHADOW_REACH },
  deals: { paddingHorizontal: 20, gap: 12, paddingTop: 4, paddingBottom: 20 + SHADOW_REACH },
  dealsHint: { paddingHorizontal: 20, marginTop: -6, marginBottom: 8 },
  rows: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 12 + SHADOW_REACH,
    gap: 8,
    alignItems: 'flex-end',
  },
  row: { gap: 12, paddingHorizontal: 20 },
  bottom: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  voice: {
    flex: 1,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  voiceTitle: { fontFamily: sceneFont.italic, ...scale.lead, color: scene.cream },
  voiceHint: { fontFamily: sceneFont.uiText, ...scale.caption, color: scene.creamMuted },
  mic: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  checkout: {
    flex: 1,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: scene.pomegranate,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    ...shadow.paper,
  },
  checkoutTitle: { fontFamily: sceneFont.display, ...scale.lead, color: scene.cream },
  checkoutSub: {
    fontFamily: sceneFont.uiText,
    ...scale.caption,
    color: scene.creamMuted,
    fontVariant: ['tabular-nums'],
  },
  checkoutArrow: { fontFamily: sceneFont.display, ...scale.title, color: scene.cream },
});
