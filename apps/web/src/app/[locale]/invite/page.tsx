import { InviteScreen } from '@/components/go/invite-screen';
import { titled } from '@/lib/metadata';

export const generateMetadata = titled('invite.title');

export default async function InvitePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <InviteScreen locale={locale} />;
}
