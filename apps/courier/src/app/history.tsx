import { useAuth } from '@bazar/mobile';
import { Redirect } from 'expo-router';

import { HistoryScreen } from '@/screens/HistoryScreen';

export default function HistoryRoute() {
  const { user, ready } = useAuth();
  if (ready && !user) return <Redirect href="/login" />;
  return <HistoryScreen />;
}
