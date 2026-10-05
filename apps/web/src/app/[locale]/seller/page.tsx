import { SellerScreen } from '@/components/go/seller-screen';

export const metadata = { title: 'Стать продавцом — Bazar Delivery' };

export default async function SellerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <SellerScreen locale={locale} />;
}
