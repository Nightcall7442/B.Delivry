import type { Metadata } from 'next';

import { AddressPicker } from '@/components/go/address-picker';

export const metadata: Metadata = { title: 'Адрес доставки — Bazar Delivery' };

export default async function AddressPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <AddressPicker locale={locale} />;
}
