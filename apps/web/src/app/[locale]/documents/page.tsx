import { DocumentsScreen } from '@/components/go/documents-screen';
import { titled } from '@/lib/metadata';

export const generateMetadata = titled('docs.title');

export default async function DocumentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <DocumentsScreen locale={locale} />;
}
