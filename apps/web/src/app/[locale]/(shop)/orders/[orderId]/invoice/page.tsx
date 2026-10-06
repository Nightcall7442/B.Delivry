import { InvoiceView } from '@/components/go/invoice-view';
import { titled } from '@/lib/metadata';

export const generateMetadata = titled('order.invoice');

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ locale: string; orderId: string }>;
}) {
  const { locale, orderId } = await params;
  return <InvoiceView orderId={orderId} locale={locale} />;
}
