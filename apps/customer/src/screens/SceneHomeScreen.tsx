/**
 * The front door as a walk into the bazaar: one photograph of the rows fills
 * the screen, the greeting sits on it, then the people who are at their
 * counters right now, the rows to walk along, and everything on the counters
 * today as cardboard signs you can take straight into the basket. Morning and
 * evening are the same screen in different light. No tab bar — the row is the
 * navigation, the basket is a disc that turns into «Оформить» once it has
 * something in it, the profile is the initial in the corner.
 */
import { arrivedToday, tr, unitLabel } from '@bazar/storefront';
import type { CategoryDto, ProductDto } from '@bazar/types';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BasketGlyph,
  CartDisc,
  Display,
  Eyebrow,
  Glass,
  KraftTag,
  RowSign,
  SCENES,
  Scene,
  isEvening,
  SceneButton,
  ProductCard,
  SceneHead,
  VendorCard,
  scene,
  sceneFont,
  useSceneTop,
} from '@/components/bazar';
import { LoadError } from '@/components/ui/Page';
import { useCart, useCartActions } from '@/features/cart/store';
import { listCategories, listProducts, listStores } from '@/lib/catalog';
import { useLoad } from '@/lib/use-data';
import { Bell, Mic, useAuth, useLocale } from '@bazar/mobile';

const TILTS = [-1.5, 1, -1, 1.5, -1, 1];

export function SceneHomeScreen() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const top = useSceneTop();
  const { quantities } = useCart();
  const { setQuantity } = useCartActions();
  const storeLoad = useLoad(() => listStores(), []);
  const categoryLoad = useLoad(() => listCategories(), []);
  const productLoad = useLoad(() => listProducts(), []);
  const evening = isEvening();
  const units = unitLabel(locale);

  const stores = storeLoad.data ?? [];
  const categories = categoryLoad.data ?? [];
  // People first: a stall with a named owner is a person, a supermarket is a building; open ones lead.
  const vendors = useMemo(
    () =>
      [...stores].sort(
        (a, b) =>
          Number(b.isOpen) - Number(a.isOpen) || Number(!!b.ownerName) - Number(!!a.ownerName),
      ),
    [stores],
  );
  // What is on the counters: this morning's arrivals first, then the rest, stalls interleaved.
  const counter = useMemo(() => {
    const open = new Set(stores.filter((s) => s.isOpen).map((s) => s.id));
    const fresh = (p: ProductDto) => Number(arrivedToday(p));
    return (productLoad.data ?? [])
      .filter((p) => p.available && (open.size === 0 || open.has(p.storeId)))
      .sort((a, b) => fresh(b) - fresh(a) || a.storeId.localeCompare(b.storeId));
  }, [productLoad.data, stores]);
  const inCart = counter.filter((p) => quantities[p.id]);
  const total = inCart.reduce((sum, p) => sum + p.price.amount * (quantities[p.id] ?? 0), 0);
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

  return (
    <View style={{ flex: 1, backgroundColor: scene.night }}>
      <Scene
        source={evening ? SCENES.evening : SCENES.morning}
        evening={evening}
        style={StyleSheet.absoluteFill}
      >
        <View />
      </Scene>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: top + 56, paddingBottom: 110 + insets.bottom }}
      >
        <View style={s.greeting}>
          <Eyebrow>
            {capitalize(dateLine)} · {t(evening ? 'scene.eveningLine' : 'scene.morningLine')}
          </Eyebrow>
          <Display size={46} italic={evening}>
            {t(evening ? 'scene.evening' : 'scene.morning')}
            {user?.firstName ? `,\n${user.firstName}` : ''}
          </Display>
        </View>

        {/* Let the photograph breathe before the people arrive. */}
        <View style={{ height: Math.round(height * 0.2) }} />

        {failed ? (
          <View style={{ paddingHorizontal: 20 }}>
            <LoadError onRetry={() => void storeLoad.reload()} />
          </View>
        ) : null}
        <SceneHead
          title={t('scene.vendorsHere')}
          action={t('scene.vendorsAll', { count: stores.length })}
          onAction={() => router.push('/(tabs)/categories')}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
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

        <SceneHead
          title={t('scene.walkRow')}
          action={t('scene.rowsAll')}
          onAction={() => router.push('/(tabs)/categories')}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.rows}
        >
          {categories.slice(0, 6).map((category: CategoryDto, index) => (
            <RowSign
              key={category.id}
              title={tr(category.name, locale)}
              tilt={TILTS[index % TILTS.length] as number}
              onPress={() =>
                router.push({ pathname: '/ryad/[categoryId]', params: { categoryId: category.id } })
              }
            />
          ))}
        </ScrollView>

        <SceneHead
          title={t('scene.onCounterToday')}
          action={t('scene.rowsAll')}
          onAction={() => router.push('/(tabs)/categories')}
        />
        <View style={s.grid}>
          {counter.map((product, i) => {
            const qty = quantities[product.id] ?? 0;
            const stall = stores.find((store) => store.id === product.storeId);
            return (
              <ProductCard
                key={product.id}
                style={s.card}
                photo={product.images[0]?.url ?? null}
                tilt={[-1.2, 1, 0.6, -0.8][i % 4] ?? 0}
                side={i % 2 ? 'right' : 'left'}
                title={tr(product.name, locale)}
                price={`${t.money(product.price.amount, product.price.currency)} / ${units[product.unit]}`}
                say={product.description ? tr(product.description, locale) : undefined}
                note={
                  [
                    stall ? (stall.ownerName ?? tr(stall.name, locale)) : null,
                    arrivedToday(product) ? t('store.arrivedToday') : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
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
          })}
        </View>
      </ScrollView>

      <View style={[s.top, { top }]}>
        <KraftTag>{evening ? 'Чорсу · вечер · до 21:00' : 'Чорсу · утро · +18°'}</KraftTag>
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
              <Mic size={22} color={evening ? '#F2A93B' : scene.saffron} />
            </Glass>
          </>
        ) : (
          <>
            <Glass style={s.voice} onPress={() => router.push('/list')}>
              <Mic size={22} color={evening ? '#F2A93B' : scene.saffron} />
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={s.voiceTitle}>{t(evening ? 'scene.sayEvening' : 'scene.say')}</Text>
                <Text style={s.voiceHint} numberOfLines={1}>
                  {t('scene.sayHint')}
                </Text>
              </View>
            </Glass>
            <CartDisc count={0} evening={evening} onPress={() => router.push('/(tabs)/cart')} />
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
  initial: { fontFamily: sceneFont.display, fontSize: 20, color: scene.pomegranate },
  greeting: { paddingHorizontal: 20, gap: 6 },
  vendors: { paddingHorizontal: 20, gap: 10, paddingBottom: 8 },
  rows: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 12, gap: 8, alignItems: 'flex-end' },
  grid: { gap: 20, paddingHorizontal: 20, paddingTop: 6 },
  card: { width: '100%' },
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
  voiceTitle: { fontFamily: sceneFont.italic, fontSize: 17, color: scene.cream },
  voiceHint: { fontFamily: sceneFont.uiText, fontSize: 11, color: scene.creamDim },
  mic: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  checkout: {
    flex: 1,
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
  checkoutTitle: { fontFamily: sceneFont.display, fontSize: 18, color: scene.cream },
  checkoutSub: { fontFamily: sceneFont.uiText, fontSize: 11, color: '#D9C7A6' },
  checkoutArrow: { fontFamily: sceneFont.display, fontSize: 20, color: scene.cream },
});
