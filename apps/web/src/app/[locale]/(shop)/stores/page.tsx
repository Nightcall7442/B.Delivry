import { redirect } from 'next/navigation';

/** The home sheet is the store list now. */
export default async function StoresPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}`);
}
