import { RulesScreen } from '@/components/go/rules-screen';
import { titled } from '@/lib/metadata';

export const generateMetadata = titled('rules.title');

export default async function RulesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <RulesScreen locale={locale} />;
}
