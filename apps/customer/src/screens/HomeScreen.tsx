/**
 * Home of the redesign: where to deliver, search + dictation, the promo (or
 * holiday) card, categories with 3D icons, today's arrivals and discounts,
 * recipe sets, and the stalls nearby. The map moved to the address picker and
 * the order screen — the front door is the shelf, not the street.
 */
import {
  activeHoliday,
  addressLabel,
  cashbackFor,
  categoryPhotoUrl,
  currentSeason,
  type MapStoreDto,
  arrivedToday,
  bundlesFor,
  estimateDelivery,
  getBundle,
  type Holiday,
  holidayDaysLeft,
  orderStatusText,
  photo,
  PHOTOS,
  tashkentDate,
  tr,
} from '@bazar/storefront';
import { CASHBACK } from '@bazar/constants';
import type { MessageKey } from '@bazar/i18n';
import type { CategoryDto, ProductDto } from '@bazar/types';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { ProductTile } from '@/components/shop/ProductTile';
import { Stories } from '@/components/shop/Stories';
import { Ticker } from '@/components/shop/Ticker';
import { promoted } from '@/components/shop/StoreRow';
import { Bone, Card, LoadError, Page, SectionHead, ui, Glyph } from '@/components/ui/Page';
import { DEFAULT_POINT, useAddress } from '@/features/address/store';
import { useCartItem } from '@/features/cart/store';
import { useActiveOrder, useOrderList } from '@/features/orders/store';
import { listCategories, listProducts, listStores } from '@/lib/catalog';
import { useLoad } from '@/lib/use-data';
import {
  Bell,
  Chevron,
  Coin,
  Mic,
  Photo,
  Pin,
  Plus,
  Search,
  Text,
  api,
  color,
  noOutline,
  press,
  shadow,
  useAuth,
  useBrand,
  useLocale,
  Star,
  Wallet,
  Gift,
  Scooter,
  Basket,
} from '@bazar/mobile';

/** Fluent 3D emoji per category slug (MIT); the basket for anything unknown. */

export const categoryPhoto = (category: { slug: string }): string | null =>
  categoryPhotoUrl(category.slug, 500);

export function HomeScreen() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { address } = useAddress();
  const storeLoad = useLoad(() => listStores(), []);
  const categoryLoad = useLoad(() => listCategories(), []);
  const productLoad = useLoad(() => listProducts(), []);
  const loading = !storeLoad.data || !categoryLoad.data || !productLoad.data;
  const failed = loading && (storeLoad.error || categoryLoad.error || productLoad.error);
  const refresh = () =>
    Promise.all([storeLoad.reload(), categoryLoad.reload(), productLoad.reload()]).then(
      () => undefined,
    );
  const stores = storeLoad.data ?? [];
  const categories = categoryLoad.data ?? [];
  const products = productLoad.data ?? [];
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const suggestions = useMemo(
    () =>
      needle.length < 2
        ? []
        : products
            .filter((p) => p.available && tr(p.name, locale).toLowerCase().includes(needle))
            .slice(0, 5),
    [needle, products, locale],
  );
  // What this customer already buys: the fastest reorder is a tile on the front page.
  const { orders } = useOrderList();
  const { user } = useAuth();
  const balance = useLoad(
    () =>
      user
        ? api()
            .payments.balance()
            .then((w) => w.amount)
        : Promise.resolve(null),
    [user?.id],
  ).data;
  // The long tail of the front page: everything else, best-rated first, two columns of photos.
  const feed = useMemo(() => {
    const rows = products
      .filter((p) => p.available)
      .sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount)
      .slice(0, 14);
    return [rows.filter((_, i) => i % 2 === 0), rows.filter((_, i) => i % 2 === 1)];
  }, [products]);
  const ordered = useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const order of orders)
      for (const item of order.items)
        if (item.productId && !seen.has(item.productId)) {
          seen.add(item.productId);
          ids.push(item.productId);
        }
    return ids
      .map((id) => products.find((p) => p.id === id))
      .filter((p): p is (typeof products)[number] => !!p && p.available)
      .slice(0, 10);
  }, [orders, products]);
  const { holiday: preview } = useLocalSearchParams<{ holiday?: string }>();
  const holiday = activeHoliday(new Date(), preview);
  const brand = useBrand();

  const ranked = useMemo(() => {
    const point = address?.point ?? DEFAULT_POINT;
    const withEta = stores.map((store) => ({
      store,
      eta: estimateDelivery(store.point, point, store.preparationMinutes).etaMinutes,
    }));
    const byEta = withEta.sort((a, b) => a.eta - b.eta);
    return [...byEta].sort((a, b) => Number(promoted(b.store)) - Number(promoted(a.store)));
  }, [stores, address]);

  // "Скидки и свежее": today's arrivals first, then anything with an old price.
  const deals = useMemo(() => {
    const fresh = products.filter((p) => p.available && arrivedToday(p));
    const cheaper = products.filter((p) => p.available && p.oldPrice && !arrivedToday(p));
    return [...fresh, ...cheaper].slice(0, 10);
  }, [products]);

  const holidayEyebrow = (h: Holiday) => {
    const days = holidayDaysLeft(h);
    if (h.from > tashkentDate())
      return t('holiday.soon', { date: t.date(`${h.from}T00:00:00+05:00`) });
    return days === 0 ? t('holiday.lastDay') : t('holiday.daysLeft', { days });
  };
  const chorsu = stores.find((store) => store.slug === 'chorsu-zelen') ?? stores[0];
  const season = currentSeason(new Date());
  const seasonCategory = categories.find((c) => c.slug === season.category);
  const [heroPage, setHeroPage] = useState(0);
  const heroes: Array<Omit<HeroProps, 'width'>> = [
    ...(holiday
      ? [
          {
            id: 'holiday',
            eyebrow: holidayEyebrow(holiday),
            title: tr(holiday.title, locale),
            hint: tr(holiday.hint, locale),
            photo: getBundle(holiday.bundleSlug)?.photo ?? '',
            onPress: () =>
              router.push({ pathname: '/bundle/[slug]', params: { slug: holiday.bundleSlug } }),
          },
        ]
      : []),
    {
      id: 'promo',
      eyebrow: t('home.promoEyebrow'),
      title: t('home.promoTitle'),
      hint: t('home.promoHint'),
      photo: chorsu?.counterPhotoUrl ?? PHOTOS['promo-chorsu'] ?? '',
      onPress: () => {
        if (chorsu) router.push({ pathname: '/store/[storeId]', params: { storeId: chorsu.id } });
      },
    },
    {
      id: 'season',
      eyebrow: t('home.seasonEyebrow'),
      title: tr(season.title, locale),
      hint: tr(season.hint, locale),
      photo: PHOTOS[season.photo] ?? '',
      onPress: () =>
        router.push({
          pathname: '/search',
          params: seasonCategory ? { category: seasonCategory.id } : {},
        }),
    },
  ];
  // Four category tiles per row whatever the phone: (width − gutters − 3 gaps) / 4.
  const { width } = useWindowDimensions();
  const tileWidth = Math.floor((Math.min(width, 520) - 32 - 20) / 3);
  const heroWidth = Math.min(width, 520) - 32;

  return (
    <Page
      tabs
      glass
      onRefresh={refresh}
      header={
        <>
          <Pressable onPress={() => router.push('/address')} style={s.where}>
            <View style={s.pin}>
              <Pin size={20} color={ui.brandDeep} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text role="caption">
                {t(greetingKey(new Date()))}
                {' · '}
                {brand.city ?? t('common.city')}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text role="title" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {address ? addressLabel(address.text) : t('home.setAddress')}
                </Text>
                {address ? (
                  <View style={{ transform: [{ rotate: '90deg' }] }}>
                    <Chevron size={16} color={color.inkMuted} />
                  </View>
                ) : (
                  <View style={s.cta}>
                    <Text role="caption" style={s.ctaText}>
                      {t('home.setAddressCta')}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </Pressable>
          {user && balance !== null && balance > 0 ? (
            <Pressable
              onPress={() => router.push('/profile')}
              style={({ pressed }) => [s.bonus, press.base, pressed && press.down]}
              accessibilityRole="button"
              accessibilityLabel={t('home.bonuses')}
            >
              <Coin size={16} color={ui.brandDeep} strokeWidth={2.2} />
              <Text role="caption" style={s.bonusText}>
                {t.qty(Math.floor(balance / 100))}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => router.push('/orders')}
            style={({ pressed }) => [s.round, press.base, pressed && press.down]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.notifications')}
          >
            <Bell size={20} />
          </Pressable>
        </>
      }
    >
      <View style={s.searchRow}>
        <View style={s.search}>
          <Search size={20} color={color.inkFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('home.search')}
            placeholderTextColor={color.inkFaint}
            returnKeyType="search"
            onSubmitEditing={() => router.push({ pathname: '/search', params: { q: query } })}
            style={s.searchInput}
          />
          <Pressable
            onPress={() => router.push('/list')}
            style={({ pressed }) => [s.mic, press.base, pressed && press.down]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.dictate')}
          >
            <Mic size={18} color={color.white} strokeWidth={2.2} />
          </Pressable>
        </View>
      </View>

      {suggestions.length > 0 ? (
        <Card style={s.suggest}>
          {suggestions.map((p) => (
            <Pressable
              key={p.id}
              onPress={() =>
                router.push({ pathname: '/product/[productId]', params: { productId: p.id } })
              }
              style={({ pressed }) => [s.suggestRow, pressed && { opacity: 0.7 }]}
            >
              <Photo uri={p.images[0]?.url} style={s.suggestPhoto} />
              <Text role="body" numberOfLines={1} style={{ flex: 1, fontSize: 15 }}>
                {tr(p.name, locale)}
              </Text>
              <Text role="price" style={{ fontSize: 14 }}>
                {t.money(p.price.amount)}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => router.push({ pathname: '/search', params: { q: query.trim() } })}
            style={s.suggestAll}
          >
            <Text role="muted" style={{ color: ui.brandDeep, fontWeight: '600' }}>
              {t('home.suggestAll', { q: query.trim() })}
            </Text>
          </Pressable>
        </Card>
      ) : null}

      <Ticker products={products} />
      <OrderBanner />
      {failed ? <LoadError onRetry={() => void refresh()} /> : null}

      {/* The hero: morning delivery, the season, and the holiday table while its window is open. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[s.rail, { marginTop: 14 }]}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
        snapToInterval={heroWidth + 12}
        decelerationRate="fast"
        onMomentumScrollEnd={(e) =>
          setHeroPage(Math.round(e.nativeEvent.contentOffset.x / (heroWidth + 12)))
        }
      >
        {heroes.map((hero) => (
          <HeroCard key={hero.id} {...hero} width={heroWidth} />
        ))}
      </ScrollView>
      {heroes.length > 1 ? (
        <View style={s.dots}>
          {heroes.map((hero, i) => (
            <View key={hero.id} style={[s.dot, i === heroPage && s.dotOn]} />
          ))}
        </View>
      ) : null}

      <SectionHead
        title={t('home.categories')}
        action={t('common.all')}
        onAction={() => router.push('/categories')}
      />
      <View style={s.grid}>
        {loading
          ? Array.from({ length: 6 }, (_, i) => (
              <Bone key={i} style={{ width: tileWidth, height: 150, borderRadius: 20 }} />
            ))
          : null}
        {categories.slice(0, 6).map((category, index) => (
          <CategoryCard key={category.id} category={category} width={tileWidth} index={index} />
        ))}
      </View>

      <SectionHead title={t('home.stores')} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.rail}
        contentContainerStyle={{ gap: ui.gap, paddingHorizontal: 16, paddingBottom: 12 }}
      >
        {ranked.map(({ store, eta }) => (
          <StoreCard key={store.id} store={store} etaMinutes={eta} />
        ))}
      </ScrollView>

      <SectionHead title={t('home.live')} action={t('home.storiesHint')} />
      <Stories stores={ranked.map(({ store }) => store)} />

      {ordered.length > 0 ? (
        <>
          <SectionHead
            title={t('home.ordered')}
            action={t('common.all')}
            onAction={() => router.push('/orders')}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.rail}
            contentContainerStyle={{ gap: ui.gap, paddingHorizontal: 16, paddingBottom: 12 }}
          >
            {ordered.map((product) => (
              <ProductTile key={product.id} product={product} compact />
            ))}
          </ScrollView>
        </>
      ) : null}

      {deals.length > 0 ? (
        <>
          <SectionHead
            title={t('home.deals')}
            action={t('common.all')}
            onAction={() => router.push('/search')}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.rail}
            contentContainerStyle={{ gap: ui.gap, paddingHorizontal: 16, paddingBottom: 12 }}
          >
            {deals.map((product) => (
              <ProductTile key={product.id} product={product} compact />
            ))}
          </ScrollView>
        </>
      ) : null}

      <SectionHead title={t('home.bundles')} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.rail}
        contentContainerStyle={{ gap: ui.gap, paddingHorizontal: 16, paddingBottom: 12 }}
      >
        {bundlesFor(new Date(), holiday?.key).map((bundle) => (
          <Pressable
            key={bundle.slug}
            onPress={() =>
              router.push({ pathname: '/bundle/[slug]', params: { slug: bundle.slug } })
            }
          >
            <Card style={s.bundle}>
              <Image source={{ uri: photo(bundle.photo, 500) }} style={s.bundlePhoto} />
              <View style={{ padding: 10, gap: 2 }}>
                <Text role="body" numberOfLines={1} style={{ fontWeight: '600', fontSize: 14 }}>
                  {tr(bundle.title, locale)}
                </Text>
                <Text role="caption">{t('home.serves', { count: bundle.serves })}</Text>
              </View>
            </Card>
          </Pressable>
        ))}
      </ScrollView>

      <SectionHead title={t('home.perks')} />
      <Card style={s.perks}>
        {(
          [
            [Star, t('home.perkPlus'), '/plus'],
            [Wallet, t('home.perkCashback', { percent: CASHBACK.PERCENT }), '/plus'],
            [Gift, t('home.perkInvite'), '/invite'],
          ] as const
        ).map(([icon, label, href], i) => (
          <Pressable
            key={label}
            onPress={() => router.push(href)}
            style={({ pressed }) => [s.perk, i > 0 && s.perkDivider, pressed && { opacity: 0.7 }]}
          >
            <Glyph icon={icon} size={34} />
            <Text role="caption" numberOfLines={2} style={s.perkText}>
              {label}
            </Text>
          </Pressable>
        ))}
      </Card>

      {feed[0] && feed[0].length > 0 ? (
        <>
          <SectionHead title={t('home.forYou')} />
          <View style={s.feed}>
            {feed.map((column, c) => (
              <View key={c} style={{ flex: 1, gap: 12 }}>
                {column.map((product, i) => (
                  <FeedCard key={product.id} product={product} tall={(i + c) % 2 === 0} />
                ))}
              </View>
            ))}
          </View>
        </>
      ) : null}
    </Page>
  );
}

interface HeroProps {
  id: string;
  eyebrow: string;
  title: string;
  hint: string;
  photo: string;
  onPress: () => void;
  width: number;
}

/** One page of the home hero: a photo, a dark foot, the pitch, a white pill. */
function HeroCard({ eyebrow, title, hint, photo: uri, onPress, width }: HeroProps) {
  const { t } = useLocale();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.promo, { width }, press.base, pressed && press.down]}
    >
      <Photo uri={uri ? photo(uri, 960) : null} style={StyleSheet.absoluteFill} priority="high" />
      <LinearGradient
        colors={['rgba(12,32,26,0)', 'rgba(12,32,26,0.28)', 'rgba(12,32,26,0.82)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={s.promoBody}>
        <Text role="caption" style={s.promoEyebrow}>
          {eyebrow.toUpperCase()}
        </Text>
        <Text role="display" style={s.promoTitle} numberOfLines={2}>
          {title}
        </Text>
        <View style={s.promoFoot}>
          <Text role="caption" numberOfLines={2} style={s.promoHint}>
            {hint}
          </Text>
          <View style={s.promoButton}>
            <Text role="caption" style={s.promoButtonText}>
              {t('home.shopNow')}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/** A feed card the way a marketplace does it: the photo, the price, the bonus — nothing else shouts. */
function FeedCard({ product, tall }: { product: ProductDto; tall: boolean }) {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { quantity, add } = useCartItem(
    product.id,
    product.quantityStep || 1,
    product.minQuantity || product.quantityStep || 1,
  );
  const bonus = cashbackFor(product.price.amount);
  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: '/product/[productId]', params: { productId: product.id } })
      }
      style={({ pressed }) => [s.feedCard, press.base, pressed && press.down]}
    >
      <View style={[s.feedPhoto, { height: tall ? 196 : 148 }]}>
        <Photo uri={product.images[0]?.url} style={StyleSheet.absoluteFill} />
        <Pressable
          onPress={add}
          style={({ pressed }) => [s.feedPlus, press.base, pressed && press.down]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.addOne', { name: tr(product.name, locale) })}
        >
          {quantity > 0 ? (
            <Text role="caption" style={{ color: color.white, fontWeight: '700' }}>
              {t.qty(quantity)}
            </Text>
          ) : (
            <Plus size={16} color={color.white} strokeWidth={2.6} />
          )}
        </Pressable>
      </View>
      <View style={s.feedBody}>
        <View style={s.feedPrice}>
          <Text role="price" style={{ fontSize: 15, lineHeight: 18 }}>
            {t.money(product.price.amount)}
          </Text>
          {bonus > 0 ? (
            <View style={s.feedBonus}>
              <Text role="caption" style={s.feedBonusText}>
                {t.qty(bonus / 100)}
              </Text>
              <Coin size={12} color={ui.brandDeep} strokeWidth={2.4} />
            </View>
          ) : null}
        </View>
        <Text role="caption" numberOfLines={1}>
          {tr(product.name, locale)}
        </Text>
      </View>
    </Pressable>
  );
}

/** A stall as a photo card: the counter, the name, rating and minutes — the same card language as categories. */
function StoreCard({ store, etaMinutes }: { store: MapStoreDto; etaMinutes: number | null }) {
  const router = useRouter();
  const { locale, t } = useLocale();
  const tag = !store.isOpen ? t('store.closed') : promoted(store) ? t('home.ad') : null;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/store/[storeId]', params: { storeId: store.id } })}
      style={({ pressed }) => [s.storeCard, press.base, pressed && press.down]}
    >
      <View style={[s.catPhoto, { height: 96 }]}>
        <Photo uri={store.counterPhotoUrl ?? store.coverUrl} style={StyleSheet.absoluteFill} />
        {tag ? (
          <View style={s.storeTag}>
            <Text role="caption" style={s.storeTagText}>
              {tag}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={s.catBody}>
        <Text role="caption" numberOfLines={2} style={s.catLabel}>
          {tr(store.name, locale)}
        </Text>
        <Text role="caption" numberOfLines={1} style={s.catCaption}>
          ★ {store.rating.toFixed(1)}
          {etaMinutes ? ` · ${t('common.minutes', { minutes: etaMinutes })}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

/** Morning / day / evening / night by the phone's clock. */
export function greetingKey(now: Date): MessageKey {
  const hour = now.getHours();
  if (hour < 5) return 'home.greeting.night';
  if (hour < 12) return 'home.greeting.morning';
  if (hour < 18) return 'home.greeting.day';
  if (hour < 23) return 'home.greeting.evening';
  return 'home.greeting.night';
}

export function CategoryCard({
  category,
  width,
  height = 150,
  caption,
  index = 0,
}: {
  category: CategoryDto;
  width: number;
  height?: number;
  /** A second line under the name (how many goods, for the catalogue screen). */
  caption?: string;
  /** Position in the grid: the cards settle in one after another. */
  index?: number;
}) {
  const router = useRouter();
  const { locale } = useLocale();
  const uri = categoryPhoto(category);
  return (
    <Reanimated.View entering={FadeInDown.duration(320).delay(index * 45)}>
      <Pressable
        onPress={() => router.push({ pathname: '/search', params: { category: category.id } })}
        style={({ pressed }) => [s.cat, press.base, { width, height }, pressed && press.down]}
      >
        <View style={[s.catPhoto, { height: height - 50 }]}>
          {uri ? (
            <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={s.catFallback}>
              <Basket size={40} color={color.inkFaint} />
            </View>
          )}
        </View>
        <View style={s.catBody}>
          <Text role="caption" numberOfLines={2} style={s.catLabel}>
            {tr(category.name, locale)}
          </Text>
          {caption ? (
            <Text role="caption" numberOfLines={1} style={s.catCaption}>
              {caption}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Reanimated.View>
  );
}

/** "Your order is on its way" card under the search field. */
function OrderBanner() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const latest = useActiveOrder();
  if (!latest) return null;
  const text = orderStatusText(locale)[latest.status];
  const eta = latest.etaAt
    ? Math.max(1, Math.ceil((Date.parse(latest.etaAt) - Date.now()) / 60_000))
    : null;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/order/[orderId]', params: { orderId: latest.id } })}
    >
      <Card style={s.banner}>
        <Glyph icon={Scooter} size={36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text role="body" numberOfLines={1} style={{ fontWeight: '600', fontSize: 14 }}>
            {text.title}
          </Text>
          <Text role="caption" numberOfLines={1}>
            {tr(latest.store.name, locale)}
            {eta ? ` · ${t('common.eta', { minutes: eta })}` : ''}
          </Text>
        </View>
        <Chevron size={20} color={color.inkFaint} />
      </Card>
    </Pressable>
  );
}

const s = StyleSheet.create({
  where: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  pin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ui.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ui.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...ui.shadow,
  },
  searchRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  search: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    backgroundColor: color.field,
    paddingLeft: 16,
    paddingRight: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 15, color: color.ink, height: 50, ...noOutline },
  mic: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: ui.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.glow,
    shadowOpacity: 0.22,
    shadowRadius: 10,
  },
  banner: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  promo: {
    height: 196,
    borderRadius: ui.radius,
    overflow: 'hidden',
    backgroundColor: color.tile,
  },
  cta: {
    backgroundColor: ui.brand,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  ctaText: { color: color.white, fontSize: 11, lineHeight: 14, fontWeight: '700' },
  bonus: {
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 10,
    backgroundColor: ui.brandSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  bonusText: { color: ui.brandDeep, fontSize: 13, lineHeight: 16, fontWeight: '700' },
  feed: { flexDirection: 'row', gap: 12 },
  feedCard: { backgroundColor: color.tile, borderRadius: 20, overflow: 'hidden', padding: 6 },
  feedPhoto: { backgroundColor: color.field, borderRadius: 16, overflow: 'hidden' },
  feedPlus: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    minWidth: 32,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: ui.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.glow,
    shadowOpacity: 0.25,
  },
  feedBody: { padding: 10, gap: 2 },
  feedPrice: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' },
  feedBonus: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  feedBonusText: { color: ui.brandDeep, fontSize: 13, lineHeight: 16, fontWeight: '700' },
  perks: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 4,
    backgroundColor: color.tile,
  },
  perk: { flex: 1, alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  perkDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: color.line },
  perkText: {
    color: color.ink,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  storeCard: {
    width: 176,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: color.tile,
    padding: 6,
  },
  storeTag: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  storeTagText: { color: color.ink, fontSize: 10, lineHeight: 12, fontWeight: '700' },
  suggest: { marginTop: 10, paddingVertical: 4, paddingHorizontal: 6 },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  suggestPhoto: { width: 36, height: 36, borderRadius: 10 },
  suggestAll: { paddingVertical: 10, paddingHorizontal: 6 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(27,58,52,0.18)' },
  dotOn: { width: 18, backgroundColor: ui.brandDeep },
  promoBody: { flex: 1, justifyContent: 'flex-end', padding: 16, gap: 4 },
  promoEyebrow: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  promoTitle: { color: color.white, fontSize: 24, lineHeight: 28 },
  promoFoot: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 4 },
  promoHint: { flex: 1, color: 'rgba(255,255,255,0.8)', fontSize: 12, lineHeight: 16 },
  promoButton: {
    backgroundColor: color.white,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  promoButtonText: { color: ui.brandDeep, fontWeight: '700', fontSize: 13, lineHeight: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cat: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: color.tile,
    padding: 6,
  },
  catPhoto: { borderRadius: 16, overflow: 'hidden', backgroundColor: color.field },
  catFallback: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  catBody: { paddingHorizontal: 6, paddingTop: 8, paddingBottom: 2, gap: 1 },
  catLabel: { color: color.ink, fontSize: 12, lineHeight: 15, fontWeight: '700' },
  catCaption: { color: color.inkMuted, fontSize: 11, lineHeight: 14 },
  rail: { marginHorizontal: -16 },
  bundle: { width: 168, overflow: 'hidden' },
  bundlePhoto: { width: 168, height: 108, backgroundColor: color.sand100 },
});
