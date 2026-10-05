import { useLocalSearchParams } from 'expo-router';

import { BundleScreen } from '@/screens/BundleScreen';

export default function BundleRoute() {
  const { slug, guests } = useLocalSearchParams<{ slug: string; guests?: string }>();
  return <BundleScreen slug={slug} guests={guests === undefined ? null : Number(guests)} />;
}
