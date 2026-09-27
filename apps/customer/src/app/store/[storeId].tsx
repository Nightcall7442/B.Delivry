import { isShopfront } from '@bazar/storefront';
import { useLocalSearchParams } from 'expo-router';

import { Scene } from '@/components/bazar';
import { getStore } from '@/lib/catalog';
import { useData } from '@/lib/use-data';
import { ShopScreen } from '@/screens/ShopScreen';
import { StoreScreen } from '@/screens/StoreScreen';

export default function StoreRoute() {
  const { storeId } = useLocalSearchParams<{ storeId: string }>();
  const store = useData(() => getStore(storeId), [storeId]);
  // A stall is a scene with a person; a shop is a shelf under a board.
  if (store && isShopfront(store)) return <ShopScreen store={store} />;
  if (store) return <StoreScreen storeId={storeId} />;
  // While the store loads: the hall it will stand in.
  return <Scene source={null}>{null}</Scene>;
}
