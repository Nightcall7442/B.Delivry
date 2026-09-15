import { InvoiceView } from '@/components/go/invoice-view';

export const metadata = { title: 'Накладная — Bazar Delivery' };

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ locale: string; orderId: string }>;
}) {
  const { locale, orderId } = await params;
  return <InvoiceView orderId={orderId} locale={locale} />;
}
