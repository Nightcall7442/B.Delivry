import { SellerScreen } from '@/components/go/seller-screen';
import { titled } from '@/lib/metadata';

export const generateMetadata = titled('seller.title');

export default async function SellerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <SellerScreen locale={locale} />;
}
