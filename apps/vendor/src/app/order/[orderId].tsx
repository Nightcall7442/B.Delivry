import { useAuth } from '@bazar/mobile';
import { Redirect, useLocalSearchParams } from 'expo-router';

import { OrderScreen } from '@/screens/OrderScreen';

export default function OrderRoute() {
  const { user, ready } = useAuth();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  if (ready && !user) return <Redirect href="/login" />;
  return <OrderScreen orderId={orderId} />;
}
