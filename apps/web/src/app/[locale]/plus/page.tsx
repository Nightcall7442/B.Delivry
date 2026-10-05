import { PlusScreen } from '@/components/go/plus-screen';
import { titled } from '@/lib/metadata';

export const generateMetadata = titled('plus.title');

export default async function PlusPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PlusScreen locale={locale} />;
}
