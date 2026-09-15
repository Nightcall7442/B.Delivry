import { useLocalSearchParams } from 'expo-router';

import { StoreScreen } from '@/screens/StoreScreen';

export default function StoreRoute() {
  const { storeId } = useLocalSearchParams<{ storeId: string }>();
  return <StoreScreen storeId={storeId} />;
}
