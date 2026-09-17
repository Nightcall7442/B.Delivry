import { useLocalSearchParams } from 'expo-router';

import { RowScreen } from '@/screens/RowScreen';

export default function RowRoute() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  return <RowScreen categoryId={categoryId} />;
}
