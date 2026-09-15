import { useAuth } from '@bazar/mobile';
import { Redirect } from 'expo-router';

export default function Index() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return <Redirect href={user ? '/shift' : '/login'} />;
}
