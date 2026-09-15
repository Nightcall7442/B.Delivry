import { useLocalSearchParams } from 'expo-router';

import { BundleScreen } from '@/screens/BundleScreen';

export default function BundleRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <BundleScreen slug={slug} />;
}
