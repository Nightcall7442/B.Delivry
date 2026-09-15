import { Redirect, useLocalSearchParams } from 'expo-router';

import { CheckoutScreen } from '@/screens/CheckoutScreen';

export default function CheckoutRoute() {
  const { store, stores } = useLocalSearchParams<{ store?: string; stores?: string }>();
  if (!store) return <Redirect href="/cart" />;
  // Cross-bazaar: `stores` names the other stalls of the same trip.
  const extraIds = (stores ?? '').split(',').filter((id) => id && id !== store);
  return <CheckoutScreen storeId={store} extraStoreIds={extraIds} />;
}
