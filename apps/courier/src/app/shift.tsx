import { useAuth } from '@bazar/mobile';
import { Redirect } from 'expo-router';

import { ShiftScreen } from '@/screens/ShiftScreen';

export default function ShiftRoute() {
  const { user, ready } = useAuth();
  if (ready && !user) return <Redirect href="/login" />;
  return <ShiftScreen />;
}
