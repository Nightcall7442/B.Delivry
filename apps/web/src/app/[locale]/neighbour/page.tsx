import { NeighbourScreen } from '@/components/go/neighbour-screen';

export const metadata = { title: 'Курьер махалли — Bazar Delivery' };

export default async function NeighbourPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <NeighbourScreen locale={locale} />;
}
