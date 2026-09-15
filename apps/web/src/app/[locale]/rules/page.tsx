import { RulesScreen } from '@/components/go/rules-screen';

export const metadata = { title: 'Гарантии — Bazar Delivery' };

export default async function RulesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <RulesScreen locale={locale} />;
}
