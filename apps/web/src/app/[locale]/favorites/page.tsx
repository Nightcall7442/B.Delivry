import { BazaarFavorites } from '@/components/bazar/favorites';

export const metadata = { title: 'Избранное — Bazar Delivery' };

export default async function FavoritesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <BazaarFavorites locale={locale} />;
}
