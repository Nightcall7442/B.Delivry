import { BazaarFavorites } from '@/components/bazar/favorites';
import { titled } from '@/lib/metadata';

export const generateMetadata = titled('fav.title');

export default async function FavoritesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <BazaarFavorites locale={locale} />;
}
