import { redirect } from 'next/navigation';

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  const { q } = await searchParams;
  redirect(`/${locale}/catalog${q ? `?q=${encodeURIComponent(q)}` : ''}`);
}
