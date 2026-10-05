/**
 * «Гарантии и вопросы» on one page: the two public promises, when money comes back, and the
 * questions people ask — as Bazara keeps a FAQ and a returns policy side by side. The entries and
 * their figures are @bazar/storefront's (from the constants the API enforces), shared with the web.
 */
import { FAQ, GUARANTEES, RETURNS, type HelpEntry } from '@bazar/storefront';
import { Chevron, Clock, Leaf, Panel, Text, color, useT } from '@bazar/mobile';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { scene } from '@/components/bazar';
import { Shell } from '@/components/ui/Shell';

const ICON = { freshness: Leaf, late: Clock } as const;

export default function RulesRoute() {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const body = (entry: HelpEntry) => t(entry.body, entry.params);
  return (
    <Shell
      back="history"
      peek={0.6}
      header={
        <Text role="display" style={{ color: scene.cream }}>
          {t('rules.title')}
        </Text>
      }
    >
      <Text role="muted" style={{ marginTop: 4 }}>
        {t('rules.intro')}
      </Text>

      <Text role="title" style={{ marginTop: 20 }}>
        {t('help.promises')}
      </Text>
      <View style={{ gap: 12, marginTop: 10 }}>
        {GUARANTEES.map((entry) => {
          const Icon = ICON[entry.id as keyof typeof ICON];
          return (
            <Panel key={entry.id} style={{ padding: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {Icon ? <Icon size={20} color={color.brand600} /> : null}
                <Text role="title">{t(entry.title)}</Text>
              </View>
              <Text role="muted" style={{ marginTop: 6 }}>
                {body(entry)}
              </Text>
              {entry.id === 'late' ? (
                <Text role="caption" style={{ marginTop: 6 }}>
                  {t('rules.slot.hint')}
                </Text>
              ) : null}
            </Panel>
          );
        })}
      </View>

      <Text role="title" style={{ marginTop: 24 }}>
        {t('help.returns')}
      </Text>
      <Text role="muted" style={{ marginTop: 4 }}>
        {t('help.returnsIntro')}
      </Text>
      <View style={{ gap: 12, marginTop: 10 }}>
        {RETURNS.map((entry) => (
          <Panel key={entry.id} style={{ padding: 14 }}>
            <Text role="title">{t(entry.title)}</Text>
            <Text role="muted" style={{ marginTop: 6 }}>
              {body(entry)}
            </Text>
          </Panel>
        ))}
      </View>

      <Text role="title" style={{ marginTop: 24 }}>
        {t('help.faq')}
      </Text>
      {/* One answer open at a time: the list stays a list of questions. */}
      <Panel style={{ marginTop: 10, paddingHorizontal: 14, paddingVertical: 4 }}>
        {FAQ.map((entry, i) => {
          const expanded = open === entry.id;
          return (
            <View
              key={entry.id}
              style={{
                borderTopWidth: i === 0 ? 0 : 1,
                borderColor: color.line,
                paddingVertical: 12,
              }}
            >
              <Pressable
                onPress={() => setOpen(expanded ? null : entry.id)}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                <Text role="body" style={{ flex: 1, fontWeight: '600', color: color.ink }}>
                  {t(entry.title)}
                </Text>
                <View style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}>
                  <Chevron size={18} color={color.inkMuted} />
                </View>
              </Pressable>
              {expanded ? (
                <Text role="muted" style={{ marginTop: 8 }}>
                  {body(entry)}
                </Text>
              ) : null}
            </View>
          );
        })}
      </Panel>
    </Shell>
  );
}
