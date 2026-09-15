import { redirect } from 'next/navigation';

/** Registration is the first OTP login. */
export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/login`);
}
