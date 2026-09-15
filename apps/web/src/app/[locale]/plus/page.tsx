import { PlusScreen } from '@/components/go/plus-screen';

export const metadata = { title: 'Bazar Plus' };

export default async function PlusPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PlusScreen locale={locale} />;
}
