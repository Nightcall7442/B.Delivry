import { DocumentsScreen } from '@/components/go/documents-screen';

export const metadata = { title: 'Документы — Bazar Delivery' };

export default async function DocumentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <DocumentsScreen locale={locale} />;
}
