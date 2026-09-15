import { useRouter } from 'expo-router';

import { Shell } from '@/components/ui/Shell';
import { Button, Text, useT } from '@bazar/mobile';

export default function NotFound() {
  const router = useRouter();
  const t = useT();
  return (
    <Shell
      peek={0.34}
      header={<Text role="display">{t('notFound.title')}</Text>}
      footer={<Button label={t('common.home')} onPress={() => router.replace('/')} />}
    >
      <Text role="muted" style={{ marginTop: 8 }}>
        {t('notFound.hint')}
      </Text>
    </Shell>
  );
}
