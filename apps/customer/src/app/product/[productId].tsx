import { useLocalSearchParams } from 'expo-router';

import { ProductScreen } from '@/screens/ProductScreen';

export default function ProductRoute() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  return <ProductScreen productId={productId ?? ''} />;
}
