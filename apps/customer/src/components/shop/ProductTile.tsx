/**
 * A product wherever it lies on a counter — the home, a stall, the search, the saved list, «рядом
 * на прилавке». What the competitors' cards make plain at a glance, said in the scene's own
 * cardboard: the photograph, the sale's «−N %» on it and the old price struck beside the new, the
 * heart in the corner, and «− N +» once it is in the basket. Two to a row; the tile reads the cart
 * and the hearts itself, so a list renders it straight from its `renderItem`.
 */
import { arrivedToday, discountPercent, tr, unitLabel } from '@bazar/storefront';
import type { ProductDto } from '@bazar/types';
import { useLocale } from '@bazar/mobile';
import { useRouter } from 'expo-router';
import type { StyleProp, ViewStyle } from 'react-native';
import { useWindowDimensions } from 'react-native';

import { ProductCard } from '@/components/bazar';
import { useCartItem } from '@/features/cart/store';
import { useFavorite } from '@/features/favorites/store';

const TILTS = [-1.2, 1, 0.6, -0.8];
/** Between the two tiles of a row. */
export const TILE_GAP = 12;

/** Half a row, given the screen's side margin: whole pixels, so two always fit. */
export function useTileWidth(margin = 20): number {
  const { width } = useWindowDimensions();
  return Math.floor((width - margin * 2 - TILE_GAP) / 2);
}

export function ProductTile({
  product,
  index = 0,
  stall,
  style,
}: {
  product: ProductDto;
  /** Its place in the list: the tilt of its sign. */
  index?: number;
  /** Whose counter, when the list mixes stalls: «Фарход-ака». */
  stall?: string | undefined;
  style?: StyleProp<ViewStyle>;
}) {
  const router = useRouter();
  const { locale, t } = useLocale();
  const step = product.quantityStep || 1;
  const min = product.minQuantity || step;
  const { quantity, add, remove } = useCartItem(product.id, step, min);
  const favorite = useFavorite('product', product.id, `/product/${product.id}`);
  const unit = unitLabel(locale)[product.unit];
  const percent = discountPercent(product);
  const soldOut = !product.available;
  const note = [
    soldOut ? t('fav.soldOut') : null,
    stall ?? null,
    !soldOut && arrivedToday(product) ? t('store.arrivedToday') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ProductCard
      style={style}
      compact
      photo={product.images[0]?.url ?? null}
      tilt={TILTS[index % TILTS.length] ?? 0}
      title={tr(product.name, locale)}
      price={`${t.money(product.price.amount, product.price.currency)} / ${unit}`}
      oldPrice={
        percent > 0 && product.oldPrice
          ? t.money(product.oldPrice.amount, product.oldPrice.currency)
          : undefined
      }
      badge={percent > 0 ? t('deals.badge', { percent }) : undefined}
      note={note || undefined}
      count={quantity}
      countLabel={`${t.qty(quantity)} ${unit}`}
      saved={favorite.saved}
      onSave={favorite.toggle}
      dim={soldOut}
      onPress={() => router.push(`/product/${product.id}`)}
      onAdd={soldOut ? undefined : add}
      onRemove={soldOut ? undefined : remove}
    />
  );
}
