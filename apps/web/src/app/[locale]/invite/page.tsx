import { InviteScreen } from '@/components/go/invite-screen';

export const metadata = { title: 'Пригласить друга — Bazar Delivery' };

export default async function InvitePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <InviteScreen locale={locale} />;
}
