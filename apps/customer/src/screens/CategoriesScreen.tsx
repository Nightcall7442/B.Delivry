/** Catalogue by category: big photo cards, two across, with how many goods are in each. */
import { tr } from '@bazar/storefront';
import { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { Page } from '@/components/ui/Page';
import { listCategories, listProducts } from '@/lib/catalog';
import { useData } from '@/lib/use-data';
import { CategoryCard } from '@/screens/HomeScreen';
import { useLocale } from '@bazar/mobile';

export function CategoriesScreen() {
  const { locale, t } = useLocale();
  const categories = useData(() => listCategories(), []) ?? [];
  const products = useData(() => listProducts(), []) ?? [];
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const product of products) {
      if (product.categoryId) map.set(product.categoryId, (map.get(product.categoryId) ?? 0) + 1);
    }
    return map;
  }, [products]);

  const { width } = useWindowDimensions();
  const cardWidth = Math.floor((Math.min(width, 520) - 32 - 12) / 2);

  return (
    <Page tabs title={t('categories.title')} cart>
      <View style={s.grid}>
        {categories.map((category, index) => (
          <CategoryCard
            key={category.id}
            category={category}
            width={cardWidth}
            height={150}
            index={index}
            caption={t.n('categories.items', counts.get(category.id) ?? 0)}
          />
        ))}
      </View>
    </Page>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 },
});
