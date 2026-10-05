/** The line a discounted good carries on its sign: «−20 % · было 45 000 сум». */
import type { T } from '@bazar/i18n';
import { discountPercent } from '@bazar/storefront';
import type { ProductDto } from '@bazar/types';

export function saleNote(product: Pick<ProductDto, 'price' | 'oldPrice'>, t: T): string | null {
  const percent = discountPercent(product);
  if (product.oldPrice === null || percent === 0) return null;
  return t('deals.note', {
    percent,
    old: t.money(product.oldPrice.amount, product.oldPrice.currency),
  });
}
