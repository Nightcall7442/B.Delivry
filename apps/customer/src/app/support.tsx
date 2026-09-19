/** Support: call, the Telegram bot, the rules — as cards, with the hours on top. */
import { SUPPORT } from '@bazar/constants';
import { useRouter } from 'expo-router';
import { Linking, View } from 'react-native';

import { Card, Page, Glyph } from '@/components/ui/Page';
import { Chat, Leaf, Phone, Row, Text, api, useAuth, useT } from '@bazar/mobile';

export default function SupportRoute() {
  const t = useT();
  const router = useRouter();
  const { user } = useAuth();
  return (
    <Page back="history" title={t('support.title')} cart scene>
      <Card
        style={{ marginTop: 8, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}
      >
        <Glyph icon={Chat} size={48} />
        <Text role="muted" style={{ flex: 1 }}>
          {t('support.hours')}
        </Text>
      </Card>
      <Card style={{ marginTop: 12, paddingVertical: 4, paddingHorizontal: 12 }}>
        {SUPPORT.phone ? (
          <Row
            icon={<Phone size={20} />}
            tone="brand"
            title={t('support.callTitle')}
            subtitle={SUPPORT.phone}
            onPress={() => Linking.openURL(`tel:${SUPPORT.phone?.replace(/\s/g, '')}`)}
          />
        ) : null}
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
        ) : (
          <Row
            icon={<Chat size={20} />}
            tone="brand"
            title={t('support.telegramTitle')}
            subtitle={t('support.telegramGuest')}
            onPress={() => Linking.openURL(SUPPORT.telegram)}
          />
        )}
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
