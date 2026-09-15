/**
 * One recipe set: the dish, what goes in it and from which stalls, one button
 * that puts everything on the cart.
 */
import { Button, Photo, Text, color, font, useLocale } from '@bazar/mobile';
import {
  getBundle,
  photo,
  resolveBundle,
  tr,
  type MapStoreDto,
  unitLabel,
} from '@bazar/storefront';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { Shell } from '@/components/ui/Shell';
import { DEFAULT_POINT, useAddress } from '@/features/address/store';
import { useCartActions, useCartQuantities } from '@/features/cart/store';
import { listProducts, listStores } from '@/lib/catalog';
import { useData } from '@/lib/use-data';

export function BundleScreen({ slug }: { slug: string }) {
  const router = useRouter();
  const { locale, t } = useLocale();
  const bundle = getBundle(slug);
  const { address } = useAddress();
  const quantities = useCartQuantities();
  const { setQuantity } = useCartActions();
  const [added, setAdded] = useState(false);

  const products = useData(() => listProducts(), []) ?? [];
  const stores = useData(() => listStores(), []) ?? [];
  const resolved = useMemo(
    () => (bundle ? resolveBundle(bundle, products) : null),
    [bundle, products],
  );
  const storeById = useMemo(() => new Map(stores.map((store) => [store.id, store])), [stores]);
  const stalls = (resolved?.storeIds ?? [])
    .map((id) => storeById.get(id))
    .filter((store): store is MapStoreDto => store !== undefined);

  if (!bundle || !resolved) {
    return (
      <Shell back="/" expanded map={{ center: DEFAULT_POINT, zoom: 12, interactive: false }}>
        <Text role="muted">{t('bundle.notFound')}</Text>
      </Shell>
    );
  }

  const addAll = () => {
    for (const line of resolved.lines) {
      setQuantity(line.product.id, (quantities[line.product.id] ?? 0) + line.quantity);
    }
    setAdded(true);
    setTimeout(() => router.push('/cart'), 400);
  };

  return (
    <Shell
      back="/"
      expanded
      peek={0.82}
      map={{
        center: address?.point ?? stalls[0]?.point ?? DEFAULT_POINT,
        zoom: 12,
        markers: stalls.map((store) => ({
          id: store.id,
          point: store.point,
          kind: 'store' as const,
          label: tr(store.name, locale),
        })),
        interactive: false,
      }}
      header={
        <View style={s.hero}>
          <Image
            source={{ uri: photo(bundle.photo, 960) }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          <View style={s.shade} />
          <View style={s.heroText}>
            <Text role="display" style={{ color: color.white }}>
              {tr(bundle.title, locale)}
            </Text>
            <Text role="muted" style={{ color: 'rgba(255,255,255,0.85)' }}>
              {tr(bundle.description, locale)}
            </Text>
          </View>
        </View>
      }
      footer={
        <Button
          label={added ? t('bundle.added') : t('bundle.addAll')}
          trailing={t.money(resolved.total)}
          style={{ justifyContent: 'space-between' }}
          disabled={resolved.lines.length === 0 || added || products.length === 0}
          onPress={addAll}
        />
      }
    >
      <Text role="muted" style={{ marginTop: 12 }}>
        {t.n('bundle.people', bundle.serves)} · {t.n('bundle.products', resolved.lines.length)} ·{' '}
        {stalls.map((store) => tr(store.name, locale)).join(', ')}
      </Text>

      <View style={{ marginTop: 8 }}>
        {resolved.lines.map((line) => (
          <View key={line.product.id} style={s.line}>
            <Photo
              uri={line.product.images[0] ? photo(line.product.images[0].url, 250) : null}
              style={s.thumb}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text role="body" numberOfLines={1}>
                {tr(line.product.name, locale)}
              </Text>
              <Text role="caption">
                {line.quantity} {unitLabel(locale)[line.product.unit]} ·{' '}
                {tr(storeById.get(line.product.storeId)?.name, locale)}
              </Text>
            </View>
            <Text style={s.price}>{t.money(line.total)}</Text>
          </View>
        ))}
      </View>

      {resolved.missing.length > 0 ? (
        <Text role="caption" style={{ marginTop: 8 }}>
          {t.n('bundle.missing', resolved.missing.length)}
        </Text>
      ) : null}

      {stalls.length > 1 ? (
        <Text role="muted" style={{ marginTop: 12 }}>
          {t('bundle.multiStall', { count: stalls.length })}
        </Text>
      ) : null}
    </Shell>
  );
}

const s = StyleSheet.create({
  hero: {
    marginHorizontal: -16,
    marginTop: -8,
    height: 176,
    backgroundColor: color.brand950,
    overflow: 'hidden',
  },
  shade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(4,43,41,0.45)' },
  heroText: { flex: 1, justifyContent: 'flex-end', padding: 16, gap: 4 },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  thumb: { width: 44, height: 44, borderRadius: 12 },
  price: {
    fontFamily: font.displayBold,
    fontSize: 14,
    color: color.ink,
    fontVariant: ['tabular-nums'],
  },
});
