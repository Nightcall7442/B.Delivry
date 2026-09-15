import { useLocalSearchParams } from 'expo-router';

import { OrderScreen } from '@/screens/OrderScreen';

export default function OrderRoute() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  return <OrderScreen orderId={orderId} />;
}
