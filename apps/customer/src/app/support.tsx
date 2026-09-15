/** Support: call, the Telegram bot, the rules — as cards, with the hours on top. */
import { useRouter } from 'expo-router';
import { Linking, View } from 'react-native';

import { Card, Page, Glyph } from '@/components/ui/Page';
import { Chat, Leaf, Phone, Row, Text, api, useAuth, useT } from '@bazar/mobile';

const PHONE = '+998 71 200 00 00';

export default function SupportRoute() {
  const t = useT();
  const router = useRouter();
  const { user } = useAuth();
  return (
    <Page back="history" title={t('support.title')} cart>
      <Card
        style={{ marginTop: 8, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}
      >
        <Glyph icon={Chat} size={48} />
        <Text role="muted" style={{ flex: 1 }}>
          {t('support.hours')}
        </Text>
      </Card>
      <Card style={{ marginTop: 12, paddingVertical: 4, paddingHorizontal: 12 }}>
        <Row
          icon={<Phone size={20} />}
          tone="brand"
          title={t('support.callTitle')}
          subtitle={PHONE}
          onPress={() => Linking.openURL('tel:+998712000000')}
        />
        {user ? (
          <Row
            icon={<Chat size={20} />}
            tone="brand"
            title={t('support.telegramTitle')}
            subtitle={user.telegramLinked ? t('menu.telegramLinked') : t('menu.telegramHint')}
            onPress={() =>
              void api()
                .notifications.telegramLink()
                .then(({ url }) => Linking.openURL(url))
                .catch(() => undefined)
            }
          />
        ) : null}
        <Row
          icon={<Leaf size={20} />}
          tone="saffron"
          title={t('support.rulesTitle')}
          subtitle={t('support.rulesHint')}
          onPress={() => router.push('/rules')}
        />
      </Card>
      <View style={{ height: 8 }} />
    </Page>
  );
}
