/**
 * One recipe set as a walk along the counters: the dish fills the screen,
 * under it the products it takes — each a photo card with its cardboard sign
 * and the stall it comes from — and one pomegranate bar that puts the whole
 * dastarkhan in the basket. Prices are live, never the set's own number.
 */
import { ArrowLeft, Text as UiText, radius, scale, shadow, useLocale } from '@bazar/mobile';
import {
  bundleGuests,
  bundleTitle,
  getBundle,
  photo,
  resolveBundle,
  tr,
  type MapStoreDto,
  unitLabel,
} from '@bazar/storefront';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BasketGlyph,
  CartDisc,
  Display,
  Eyebrow,
  KraftTag,
  ProductCard,
  Say,
  Scene,
  SceneButton,
  scene,
  sceneFont,
  useSceneTop,
} from '@/components/bazar';
import { GuestStepper } from '@/components/shop/GuestStepper';
import { Bone } from '@/components/ui/Page';
import { useCartActions, useCartCount, useCartQuantities } from '@/features/cart/store';
import { listProducts, listStores } from '@/lib/catalog';
import { useData, useList } from '@/lib/use-data';

export function BundleScreen({ slug, guests: asked }: { slug: string; guests?: number | null }) {
  const router = useRouter();
  const { locale, t } = useLocale();
  const insets = useSafeAreaInsets();
  const top = useSceneTop();
  const count = useCartCount();
  const bundle = getBundle(slug);
  // «Ош на N человек»: the company from the link, within the set's range; the set's own otherwise.
  const [guests, setGuests] = useState(() => (bundle ? bundleGuests(bundle, asked) : 0));
  const quantities = useCartQuantities();
  const { setQuantity } = useCartActions();
  const [added, setAdded] = useState(false);
  const units = unitLabel(locale);

  const products = useData(() => listProducts(), []);
  const stores = useList(() => listStores(), []);
  const resolved = useMemo(
    () => (bundle && products ? resolveBundle(bundle, products, guests) : null),
    [bundle, products, guests],
  );
  const storeById = useMemo(() => new Map(stores.map((store) => [store.id, store])), [stores]);
  const stalls = (resolved?.storeIds ?? [])
    .map((id) => storeById.get(id))
    .filter((store): store is MapStoreDto => store !== undefined);

  const addAll = () => {
    if (!resolved) return;
    for (const line of resolved.lines) {
      setQuantity(line.product.id, (quantities[line.product.id] ?? 0) + line.quantity);
    }
    setAdded(true);
    setTimeout(() => router.push('/(tabs)/cart'), 400);
  };

  return (
    <View style={{ flex: 1 }}>
      <Scene source={bundle ? photo(bundle.photo, 960) : null} style={StyleSheet.absoluteFill}>
        {null}
      </Scene>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: top + 56, paddingBottom: 120 + insets.bottom }}
      >
        {!bundle ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 40 }}>
            <Say color={scene.creamMuted}>{t('bundle.notFound')}</Say>
          </View>
        ) : (
          <>
            <View style={s.greeting}>
              <Display>{bundleTitle(t, bundle, guests)}</Display>
              <Say color={scene.creamMuted} numberOfLines={3}>
                {tr(bundle.description, locale)}
              </Say>
              {bundle.guests ? (
                <View style={s.guests}>
                  <GuestStepper
                    bundle={bundle}
                    guests={guests}
                    onChange={(next) => {
                      setGuests(next);
                      setAdded(false);
                    }}
                    label={t('bundle.guests')}
                  />
                  {resolved && resolved.lines.length > 0 ? (
                    <Text style={s.perGuest}>
                      {t('bundle.perGuest', { amount: t.money(resolved.perGuest) })}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
            {/* Let the dish breathe before the counters. */}
            <View style={{ height: 120 }} />

            {!resolved ? (
              <View style={{ paddingHorizontal: 20, gap: 12 }}>
                <Bone style={{ height: 24, width: 200 }} />
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Bone style={{ flex: 1, height: 220 }} />
                  <Bone style={{ flex: 1, height: 220 }} />
                </View>
              </View>
            ) : (
              <>
                <View style={s.head}>
                  <Eyebrow>
                    {t.n('bundle.products', resolved.lines.length)}
                    {stalls.length > 0
                      ? ` · ${stalls.map((store) => store.ownerName ?? tr(store.name, locale)).join(', ')}`
                      : ''}
                  </Eyebrow>
                </View>
                <View style={s.grid}>
                  {resolved.lines.map((line, i) => {
                    const stall = storeById.get(line.product.storeId);
                    const qty = quantities[line.product.id] ?? 0;
                    return (
                      <ProductCard
                        key={line.product.id}
                        style={s.card}
                        compact
                        photo={line.product.images[0]?.url ?? null}
                        tilt={[-1.2, 1, 0.6, -0.8][i % 4] ?? 0}
                        title={tr(line.product.name, locale)}
                        price={`${t.qty(line.quantity)} ${units[line.product.unit]} · ${t.money(line.total)}`}
                        note={stall ? (stall.ownerName ?? tr(stall.name, locale)) : undefined}
                        count={qty}
                        countLabel={t('scene.inCart', {
                          count: `${t.qty(qty)} ${units[line.product.unit]}`,
                        })}
                        onPress={() => router.push(`/product/${line.product.id}`)}
                        onAdd={() => setQuantity(line.product.id, qty + line.quantity)}
                      />
                    );
                  })}
                </View>
                {resolved.missing.length > 0 ? (
                  <Say step="lead" color={scene.creamMuted} style={s.note}>
                    {t.n('bundle.missing', resolved.missing.length)}
                  </Say>
                ) : null}
                {stalls.length > 1 ? (
                  <UiText role="caption" style={s.multi}>
                    {t('bundle.multiStall', { count: stalls.length })}
                  </UiText>
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>

      <View style={[s.top, { top }]}>
        <SceneButton
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        >
          <ArrowLeft size={20} color={scene.ink} />
        </SceneButton>
        {bundle ? <KraftTag>{t.n('bundle.people', guests)}</KraftTag> : null}
      </View>

      {resolved && resolved.lines.length > 0 ? (
        <View style={[s.bottom, { bottom: 24 + insets.bottom }]}>
          <Pressable
            onPress={addAll}
            disabled={added}
            style={({ pressed }) => [s.cta, (pressed || added) && { opacity: 0.92 }]}
          >
            <BasketGlyph color={scene.cream} size={22} />
            <View style={{ flex: 1 }}>
              <Text style={s.ctaTitle}>{added ? t('bundle.added') : t('bundle.addAll')}</Text>
              <Text style={s.ctaSub} numberOfLines={1}>
                {t.n('bundle.products', resolved.lines.length)} · {t.money(resolved.total)}
              </Text>
            </View>
            <Text style={s.ctaArrow}>→</Text>
          </Pressable>
          <CartDisc count={count} onPress={() => router.push('/(tabs)/cart')} />
        </View>
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
    alignItems: 'center',
    zIndex: 2,
  },
  greeting: { paddingHorizontal: 20, gap: 8 },
  guests: {
    marginTop: 10,
    padding: 14,
    gap: 6,
    borderRadius: radius.paper,
    backgroundColor: scene.glass,
    borderWidth: 1,
    borderColor: scene.glassEdge,
  },
  perGuest: {
    fontFamily: sceneFont.uiText,
    ...scale.caption,
    color: scene.creamMuted,
    fontVariant: ['tabular-nums'],
  },
  head: { paddingHorizontal: 20, paddingBottom: 12 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    rowGap: 18,
    paddingHorizontal: 20,
  },
  card: { width: '47%', flexGrow: 1, maxWidth: '50%' },
  note: { paddingHorizontal: 20, paddingTop: 16 },
  multi: { paddingHorizontal: 20, paddingTop: 10, color: scene.creamMuted },
  bottom: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cta: {
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
  ctaTitle: { fontFamily: sceneFont.display, ...scale.lead, color: scene.cream },
  ctaSub: {
    fontFamily: sceneFont.uiText,
    ...scale.caption,
    color: scene.creamMuted,
    fontVariant: ['tabular-nums'],
  },
  ctaArrow: { fontFamily: sceneFont.display, ...scale.title, color: scene.cream },
});
