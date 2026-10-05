import { NeighbourScreen } from '@/components/go/neighbour-screen';
import { titled } from '@/lib/metadata';

export const generateMetadata = titled('neighbour.title');

export default async function NeighbourPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <NeighbourScreen locale={locale} />;
}
