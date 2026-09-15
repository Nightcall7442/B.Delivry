/**
 * A stall or shop: the morning counter photo as the hero, a white card with
 * name, rating and delivery, "arrived today" rail, category chips and the
 * tile grid; the cart bar sits under the list.
 */
import { arrivedToday, estimateDelivery, storeTypeLabel, tr } from '@bazar/storefront';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ProductTile } from '@/components/shop/ProductTile';
import { StoryViewer } from '@/components/shop/Stories';
import { Bone, Card, LoadError, Page, SectionHead, ui } from '@/components/ui/Page';
import {
  Basket,
  Button,
  Chip,
  Clock,
  Photo,
  Scooter,
  Star,
  Text,
  color,
  useLocale,
} from '@bazar/mobile';

import { useAddress } from '@/features/address/store';
import { useCartQuantities } from '@/features/cart/store';
import { getStore, listCategories, listProducts } from '@/lib/catalog';
import { useData, useLoad } from '@/lib/use-data';

export function StoreScreen({ storeId }: { storeId: string }) {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { address } = useAddress();
  const quantities = useCartQuantities();
  const [category, setCategory] = useState<string | null>(null);

  const storeLoad = useLoad(() => getStore(storeId), [storeId]);
  const productLoad = useLoad(() => listProducts({ storeId }), [storeId]);
  const store = storeLoad.data;
  const products = productLoad.data ?? [];
  const refresh = () =>
    Promise.all([storeLoad.reload(), productLoad.reload()]).then(() => undefined);
  const categories = useData(() => listCategories(), []) ?? [];

  const present = useMemo(() => {
    const ids = new Set(products.map((p) => p.categoryId));
    return categories.filter((c) => ids.has(c.id));
  }, [products, categories]);
  const shown = category ? products.filter((p) => p.categoryId === category) : products;
  const fresh = products.filter((p) => arrivedToday(p) && p.available);

  const inCart = products.filter((p) => quantities[p.id]);
  const total = inCart.reduce((sum, p) => sum + p.price.amount * (quantities[p.id] ?? 0), 0);
  const estimate =
    store && address
      ? estimateDelivery(store.point, address.point, store.preparationMinutes)
      : null;

  // Tiles two across: pair them up so each row is one flex line.
  const rows = useMemo(() => {
    const out: (typeof shown)[] = [];
    for (let i = 0; i < shown.length; i += 2) out.push(shown.slice(i, i + 2));
    return out;
  }, [shown]);

  const hero = store?.counterPhotoUrl ?? store?.coverUrl ?? null;
  const [story, setStory] = useState(false);

  return (
    <Page
      back="/"
      cart
      title={store ? tr(store.name, locale) : ''}
      onRefresh={refresh}
      footer={
        inCart.length > 0 ? (
          <Button
            label={t.n('cart.items', inCart.length)}
            trailing={t.money(total)}
            style={{ justifyContent: 'space-between' }}
            onPress={() => router.push('/cart')}
          />
        ) : undefined
      }
    >
      {store ? (
        <>
          {hero ? (
            <Pressable
              onPress={() => setStory(true)}
              style={s.hero}
              accessibilityRole="button"
              accessibilityLabel={t('store.counterNow')}
            >
              <Photo uri={hero} style={StyleSheet.absoluteFill} priority="high" />
              {store.counterPhotoUrl ? (
                <View style={s.heroTag}>
                  <Text role="caption" style={{ color: color.white, fontWeight: '600' }}>
                    {t('store.counterNow')} ·{' '}
                    {t('store.counterAt', {
                      time: store.counterPhotoAt
                        ? new Date(store.counterPhotoAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '',
                    })}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
          {story ? (
            <StoryViewer stores={[store]} start={0} cta={false} onClose={() => setStory(false)} />
          ) : null}

          <Card style={s.info}>
            <View style={s.infoHead}>
              <Photo
                uri={store.logoUrl ?? store.coverUrl}
                style={s.avatar}
                fallback={<Basket color={color.sand300} />}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text role="title" numberOfLines={2}>
                  {tr(store.name, locale)}
                </Text>
                <Text role="caption" numberOfLines={1}>
                  {storeTypeLabel(locale)[store.type]}
                  {store.description ? ` · ${tr(store.description, locale)}` : ''}
                </Text>
              </View>
            </View>
            <View style={s.stats}>
              <View style={s.stat}>
                <Star size={16} color={color.saffron500} fill={color.saffron500} />
                <Text role="muted" style={s.statText}>
                  {store.rating.toFixed(1)}
                </Text>
              </View>
              <View style={s.stat}>
                <Clock size={16} color={ui.brandDeep} />
                <Text role="muted" style={s.statText}>
                  {estimate
                    ? t('common.eta', { minutes: estimate.etaMinutes })
                    : t('store.prep', { minutes: store.preparationMinutes })}
                </Text>
              </View>
              {estimate ? (
                <View style={s.stat}>
                  <Scooter size={16} color={ui.brandDeep} />
                  <Text role="muted" style={s.statText}>
                    {t('store.delivery', { fee: t.money(estimate.fee.amount) })}
                  </Text>
                </View>
              ) : null}
            </View>
            {!store.isOpen ? (
              <View style={s.closed}>
                <Text role="muted" style={{ color: color.saffron900 }}>
                  {t('store.closedHint')}
                </Text>
              </View>
            ) : null}
          </Card>

          {store.ownerName ? (
            <Card style={s.owner}>
              <View style={s.ownerHead}>
                <Photo
                  uri={store.ownerPhotoUrl}
                  style={s.ownerPhoto}
                  fallback={
                    <Text role="section" style={{ color: ui.brandDeep }}>
                      {store.ownerName.slice(0, 1)}
                    </Text>
                  }
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text role="caption" style={s.ownerEyebrow}>
                    {t('store.owner').toUpperCase()}
                  </Text>
                  <Text role="title" numberOfLines={1}>
                    {store.ownerName}
                  </Text>
                  {store.ownerSince ? (
                    <Text role="caption">{t('store.ownerSince', { year: store.ownerSince })}</Text>
                  ) : null}
                </View>
              </View>
              {store.ownerMotto ? (
                <Text role="body" style={s.ownerMotto}>
                  «{tr(store.ownerMotto, locale)}»
                </Text>
              ) : null}
            </Card>
          ) : null}

          {fresh.length > 0 && category === null ? (
            <>
              <SectionHead title={t('store.arrivedToday')} />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={s.rail}
                contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingBottom: 12 }}
              >
                {fresh.map((product) => (
                  <ProductTile key={product.id} product={product} compact />
                ))}
              </ScrollView>
            </>
          ) : null}

          {present.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.chips}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
            >
              <Chip
                label={t('common.all')}
                active={category === null}
                onPress={() => setCategory(null)}
              />
              {present.map((c) => (
                <Chip
                  key={c.id}
                  label={tr(c.name, locale)}
                  active={category === c.id}
                  onPress={() => setCategory(c.id)}
                />
              ))}
            </ScrollView>
          ) : null}

          <View style={{ marginTop: 14, gap: 12 }}>
            {rows.map((pair) => (
              <View key={pair[0]?.id} style={{ flexDirection: 'row', gap: 12 }}>
                {pair.map((product) => (
                  <ProductTile key={product.id} product={product} />
                ))}
                {pair.length === 1 ? <View style={{ flex: 1 }} /> : null}
              </View>
            ))}
          </View>
        </>
      ) : storeLoad.error ? (
        <LoadError onRetry={() => void refresh()} />
      ) : (
        <>
          <Bone style={{ height: 180, marginTop: 4, borderRadius: ui.radius }} />
          <Bone style={{ height: 96, marginTop: 12 }} />
          <View style={{ marginTop: 14, gap: 12 }}>
            {[0, 1].map((row) => (
              <View key={row} style={{ flexDirection: 'row', gap: 12 }}>
                <Bone style={{ flex: 1, height: 250 }} />
                <Bone style={{ flex: 1, height: 250 }} />
              </View>
            ))}
          </View>
        </>
      )}
    </Page>
  );
}

const s = StyleSheet.create({
  hero: {
    height: 180,
    borderRadius: ui.radius,
    overflow: 'hidden',
    backgroundColor: color.sand100,
    marginTop: 4,
  },
  heroTag: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    backgroundColor: 'rgba(27,31,34,0.65)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  info: { marginTop: 12, padding: 14 },
  infoHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: color.sand100,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statText: { color: color.ink, fontWeight: '500' },
  closed: {
    marginTop: 12,
    backgroundColor: color.saffron100,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  owner: { marginTop: 12, padding: 14, gap: 10 },
  ownerHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ownerPhoto: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: ui.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerEyebrow: { fontSize: 10, letterSpacing: 1, fontWeight: '700', color: ui.brandDeep },
  ownerMotto: { fontSize: 15, lineHeight: 22, color: color.ink },
  rail: { marginHorizontal: -16 },
  chips: { marginHorizontal: -16, marginTop: 8 },
});
