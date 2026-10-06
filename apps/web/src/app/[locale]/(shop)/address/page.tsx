import { AddressPicker } from '@/components/go/address-picker';
import { titled } from '@/lib/metadata';

export const generateMetadata = titled('menu.address');

export default async function AddressPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <AddressPicker locale={locale} />;
}
