/**
 * Profile: who is signed in, the balance and Plus at a glance, then every
 * service the side menu used to hold — grouped into cards.
 */
import { PLUS } from '@bazar/constants';
import { plusActive } from '@bazar/storefront';
import { UI_LOCALES, type MessageKey } from '@bazar/i18n';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState, type ComponentType } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Ornament } from '@/components/ui/Ornament';
import { Card, Page, ui, Glyph } from '@/components/ui/Page';
import {
  Basket,
  Button,
  Chat,
  Chevron,
  Chip,
  Heart,
  Home,
  Leaf,
  Mic,
  Receipt,
  Scooter,
  Star,
  Text,
  User,
  api,
  color,
  useAuth,
  useLocale,
  isDark,
  Wallet,
} from '@bazar/mobile';

type IconComponent = ComponentType<{ size?: number; color?: string }>;
interface Item {
  key: MessageKey;
  href: Href;
  icon: IconComponent;
  /** A pastel behind the icon on white; in the dark theme every row gets the field grey. */
  tint: string;
}

const SERVICES: Item[] = [
  { key: 'menu.subscriptions', href: '/subscriptions', icon: Receipt, tint: color.brand50 },
  { key: 'menu.plus', href: '/plus', icon: Star, tint: '#FFF4D6' },
  { key: 'menu.list', href: '/list', icon: Mic, tint: '#EAF0FB' },
  { key: 'menu.invite', href: '/invite', icon: Heart, tint: '#FDE7E7' },
  { key: 'menu.business', href: '/business', icon: Basket, tint: '#EDE9FB' },
  { key: 'menu.docs', href: '/documents', icon: Receipt, tint: '#F3EFE6' },
  { key: 'menu.neighbour', href: '/neighbour', icon: Scooter, tint: '#E6F6F9' },
];
const MORE: Item[] = [
  { key: 'menu.address', href: '/address', icon: Home, tint: '#FDEBD9' },
  { key: 'menu.support', href: '/support', icon: Chat, tint: color.brand50 },
  { key: 'menu.rules', href: '/rules', icon: Leaf, tint: '#EAF0FB' },
];

export function ProfileScreen() {
  const router = useRouter();
  const { locale, t, setLocale } = useLocale();
  const { user, ready, signOut } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    if (!user) return setBalance(null);
    api()
      .payments.balance()
      .then((wallet) => setBalance(wallet.amount))
      .catch(() => undefined);
  }, [user]);

  const Row = ({ item }: { item: Item }) => {
    const Icon = item.icon;
    return (
      <Pressable
        onPress={() => router.push(item.href)}
        style={({ pressed }) => [s.row, pressed && { opacity: 0.85 }]}
      >
        <View style={[s.iconTile, { backgroundColor: isDark ? color.field : item.tint }]}>
          <Icon size={20} color={color.ink} />
        </View>
        <Text role="body" style={{ flex: 1 }}>
          {t(item.key)}
        </Text>
        <Chevron size={20} color={color.inkFaint} />
      </Pressable>
    );
  };

  return (
    <Page tabs title={t('profile.title')} cart>
      <Card style={s.hero}>
        <View style={s.avatar}>
          {user?.firstName ? (
            <Text role="section" style={{ color: color.white, fontSize: 24 }}>
              {user.firstName.slice(0, 1).toUpperCase()}
            </Text>
          ) : (
            <User size={28} color={color.white} strokeWidth={2.2} />
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text role="title" numberOfLines={1}>
            {user ? (user.firstName ?? user.phone) : t('profile.guest')}
          </Text>
          <Text role="caption" numberOfLines={2}>
            {user ? (user.firstName ? user.phone : t('profile.account')) : t('profile.guestHint')}
          </Text>
        </View>
        {ready && !user ? (
          <Button
            label={t('common.signIn')}
            style={{ height: 40, paddingHorizontal: 14 }}
            onPress={() => router.push({ pathname: '/login', params: { next: '/profile' } })}
          />
        ) : null}
      </Card>

      {user ? (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <Pressable onPress={() => router.push('/plus')} style={{ flex: 1 }}>
            <Card style={s.stat}>
              <Glyph icon={Wallet} size={32} />
              <Text role="caption">{t('menu.balance')}</Text>
              <Text role="price">{balance === null ? '…' : t.money(balance)}</Text>
            </Card>
          </Pressable>
          <Pressable onPress={() => router.push('/plus')} style={{ flex: 1 }}>
            <Card style={[s.stat, { overflow: 'hidden' }]}>
              <Ornament color={color.saffron500} opacity={0.1} />
              <Glyph icon={Star} size={32} tint={color.saffron100} stroke={color.saffron600} />
              <Text role="caption">Bazar Plus</Text>
              <Text role="price" numberOfLines={1}>
                {plusActive(user)
                  ? t('plus.activeUntil', { date: t.date(user.plusUntil ?? '') })
                  : t.money(PLUS.PRICE_MINOR)}
              </Text>
            </Card>
          </Pressable>
        </View>
      ) : null}

      <Text role="caption" style={s.groupTitle}>
        {t('profile.services').toUpperCase()}
      </Text>
      <Card style={s.group}>
        {SERVICES.map((item) => (
          <Row key={item.key} item={item} />
        ))}
      </Card>

      <Text role="caption" style={s.groupTitle}>
        {t('profile.more').toUpperCase()}
      </Text>
      <Card style={s.group}>
        {MORE.map((item) => (
          <Row key={item.key} item={item} />
        ))}
        {user ? (
          <Pressable
            onPress={() =>
              void api()
                .notifications.telegramLink()
                .then(({ url }) => Linking.openURL(url))
                .catch(() => undefined)
            }
            style={s.row}
          >
            <View style={[s.iconTile, { backgroundColor: '#E6F0FA' }]}>
              <Chat size={20} color={color.ink} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text role="body">{t('menu.telegram')}</Text>
              <Text role="caption" numberOfLines={1}>
                {user.telegramLinked ? t('menu.telegramLinked') : t('menu.telegramHint')}
              </Text>
            </View>
            <Chevron size={20} color={color.inkFaint} />
          </Pressable>
        ) : null}
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <Text role="body">{t('menu.language')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {UI_LOCALES.map((code) => (
              <Chip
                key={code}
                label={code.toUpperCase()}
                active={code === locale}
                onPress={() => {
                  setLocale(code);
                  if (user)
                    void api()
                      .customers.updateUser({ locale: code })
                      .catch(() => undefined);
                }}
              />
            ))}
          </View>
        </View>
      </Card>

      {user ? (
        <Pressable onPress={() => void signOut()} style={{ alignSelf: 'center', padding: 16 }}>
          <Text role="muted" style={{ color: color.danger, fontWeight: '500' }}>
            {t('common.signOut')}
          </Text>
        </Pressable>
      ) : null}
    </Page>
  );
}

const s = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, marginTop: 6 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: ui.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stat: { padding: 14, gap: 4 },
  groupTitle: {
    marginTop: 22,
    marginBottom: 8,
    marginLeft: 6,
    letterSpacing: 1,
    fontWeight: '700',
  },
  group: { paddingVertical: 4, paddingHorizontal: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
