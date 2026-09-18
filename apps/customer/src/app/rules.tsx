/** The two public promises, in the customer's language. */
import { GUARANTEE } from '@bazar/constants';
import { Panel, Text, useT } from '@bazar/mobile';
import { View } from 'react-native';

import { Shell } from '@/components/ui/Shell';

export default function RulesRoute() {
  const t = useT();
  return (
    <Shell
      back="history"
      peek={0.6}
      header={
        <Text role="display" style={{ color: '#FBF1DE' }}>
          {t('rules.title')}
        </Text>
      }
    >
      <Text role="muted" style={{ marginTop: 4 }}>
        {t('rules.intro')}
      </Text>
      <View style={{ gap: 12, marginTop: 16 }}>
        <Panel style={{ padding: 14 }}>
          <Text role="title">🥬 {t('rules.freshness.title')}</Text>
          <Text role="muted" style={{ marginTop: 6 }}>
            {t('rules.freshness.body', { hours: GUARANTEE.FRESHNESS_WINDOW_HOURS })}
          </Text>
        </Panel>
        <Panel style={{ padding: 14 }}>
          <Text role="title">⏱ {t('rules.late.title')}</Text>
          <Text role="muted" style={{ marginTop: 6 }}>
            {t('rules.late.body', { minutes: GUARANTEE.LATE_TOLERANCE_MINUTES })}
          </Text>
          <Text role="caption" style={{ marginTop: 6 }}>
            {t('rules.slot.hint')}
          </Text>
        </Panel>
      </View>
    </Shell>
  );
}
