/**
 * Profile as the regular's card at the bazaar: a kraft card with the name in
 * serif and the phone under it, the balance and Plus stamped on it, then
 * everything else as lists on paper slips lying on the hall. A guest gets the
 * card blank with one thing to do — sign in.
 */
import { PLUS } from '@bazar/constants';
import { plusActive } from '@bazar/storefront';
import { UI_LOCALES, type MessageKey } from '@bazar/i18n';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState, type ComponentType } from 'react';
import { Linking, Pressable, StyleSheet, Text as RNText, View } from 'react-native';

import { caps, scene, sceneFont } from '@/components/bazar';
import { Page } from '@/components/ui/Page';
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
  press,
  radius,
  scale,
  shadow,
  useAuth,
  useLocale,
} from '@bazar/mobile';

type IconComponent = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
interface Item {
  key: MessageKey;
  href: Href;
  icon: IconComponent;
}

const SERVICES: Item[] = [
  { key: 'menu.subscriptions', href: '/subscriptions', icon: Receipt },
  { key: 'menu.plus', href: '/plus', icon: Star },
  { key: 'menu.list', href: '/list', icon: Mic },
  { key: 'menu.invite', href: '/invite', icon: Heart },
  { key: 'menu.business', href: '/business', icon: Basket },
  { key: 'menu.docs', href: '/documents', icon: Receipt },
  { key: 'menu.neighbour', href: '/neighbour', icon: Scooter },
];
const MORE: Item[] = [
  { key: 'menu.address', href: '/address', icon: Home },
  { key: 'menu.support', href: '/support', icon: Chat },
  { key: 'menu.rules', href: '/rules', icon: Leaf },
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

  const row = (item: Item) => {
    const Icon = item.icon;
    return (
      <Pressable
        key={item.key}
        onPress={() => router.push(item.href)}
        style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
      >
        <Icon size={20} color={color.brand500} strokeWidth={2.2} />
        <Text role="body" style={{ flex: 1 }}>
          {t(item.key)}
        </Text>
        <Chevron size={18} color={color.inkFaint} />
      </Pressable>
    );
  };
  const plus = user ? plusActive(user) : false;

  return (
    <Page tabs title={t('profile.title')} cart>
      <View style={s.card}>
        <View style={s.cardHead}>
          <View style={s.avatar}>
            {user && !user.firstName ? (
              <User size={26} color={scene.cream} strokeWidth={2.4} />
            ) : (
              <RNText style={s.avatarText}>
                {(user?.firstName ?? '?').slice(0, 1).toUpperCase()}
              </RNText>
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <RNText style={s.eyebrow}>{user ? t('profile.regular') : t('profile.account')}</RNText>
            <RNText style={s.name} numberOfLines={1}>
              {user ? (user.firstName ?? user.phone) : t('profile.guest')}
            </RNText>
            {user?.firstName || !user ? (
              <RNText style={s.phone} numberOfLines={2}>
                {user ? user.phone : t('profile.guestHint')}
              </RNText>
            ) : null}
          </View>
        </View>

        {user ? (
          <View style={s.stamps}>
            <Pressable
              onPress={() => router.push('/plus')}
              style={({ pressed }) => [s.stamp, press.base, pressed && press.down]}
            >
              <RNText style={s.stampLabel}>{t('menu.balance')}</RNText>
              <RNText style={s.stampValue}>{balance === null ? '…' : t.money(balance)}</RNText>
            </Pressable>
            <Pressable
              onPress={() => router.push('/plus')}
              style={({ pressed }) => [
                s.stamp,
                plus && s.stampPlus,
                press.base,
                pressed && press.down,
              ]}
            >
              <RNText style={s.stampLabel}>Bazar Plus</RNText>
              <RNText style={[s.stampValue, plus && { color: color.brand500 }]} numberOfLines={1}>
                {plus
                  ? t('plus.activeUntil', { date: t.date(user.plusUntil ?? '') })
                  : t.money(PLUS.PRICE_MINOR)}
              </RNText>
            </Pressable>
          </View>
        ) : ready ? (
          <Button
            label={t('common.signIn')}
            style={{ marginTop: 16 }}
            onPress={() => router.push({ pathname: '/login', params: { next: '/profile' } })}
          />
        ) : null}
      </View>

      <RNText style={s.section}>{t('profile.services')}</RNText>
      <View style={s.slip}>{SERVICES.map(row)}</View>

      <RNText style={s.section}>{t('profile.more')}</RNText>
      <View style={s.slip}>
        {MORE.map(row)}
        {user ? (
          <Pressable
            onPress={() =>
              void api()
                .notifications.telegramLink()
                .then(({ url }) => Linking.openURL(url))
                .catch(() => undefined)
            }
            style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
          >
            <Chat size={20} color={color.brand500} strokeWidth={2.2} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text role="body">{t('menu.telegram')}</Text>
              <Text role="caption" numberOfLines={1}>
                {user.telegramLinked ? t('menu.telegramLinked') : t('menu.telegramHint')}
              </Text>
            </View>
            <Chevron size={18} color={color.inkFaint} />
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
      </View>

      {user ? (
        <Pressable onPress={() => void signOut()} style={{ alignSelf: 'center', padding: 18 }}>
          <RNText style={s.signOut}>{t('common.signOut')}</RNText>
        </Pressable>
      ) : null}
    </Page>
  );
}

// The card is kraft and the slips are paper, both in the theme's own tones (the type on them is
// theme-coloured); they lie on the hall, so they carry the one shadow. Labels on the ground are
// the eyebrow's ochre.
const s = StyleSheet.create({
  card: {
    marginTop: 8,
    backgroundColor: color.field,
    borderRadius: radius.paper,
    padding: 16,
    transform: [{ rotate: '-0.4deg' }],
    ...shadow.paper,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: color.brand500,
    borderWidth: 3,
    borderColor: color.saffron500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: sceneFont.display, ...scale.title, color: scene.cream },
  eyebrow: { ...caps, color: color.inkMuted },
  name: { fontFamily: sceneFont.display, ...scale.title, color: color.ink, marginTop: 2 },
  phone: {
    fontFamily: sceneFont.uiText,
    ...scale.body,
    color: color.inkMuted,
    fontVariant: ['tabular-nums'],
  },
  stamps: { flexDirection: 'row', gap: 10, marginTop: 16 },
  // Paper on kraft lies flat.
  stamp: {
    flex: 1,
    backgroundColor: color.surface,
    borderRadius: radius.paper,
    padding: 12,
    paddingTop: 10,
    gap: 2,
    borderWidth: 1,
    borderColor: color.lineStrong,
  },
  stampPlus: { borderColor: color.saffron500, borderStyle: 'dashed' },
  stampLabel: { ...caps, color: color.inkMuted },
  stampValue: {
    fontFamily: sceneFont.uiHeavy,
    ...scale.lead,
    color: color.ink,
    fontVariant: ['tabular-nums'],
  },
  section: { ...caps, color: scene.ochreLight, marginTop: 24, marginBottom: 10, marginLeft: 4 },
  slip: {
    backgroundColor: color.surface,
    borderRadius: radius.paper,
    paddingVertical: 4,
    paddingHorizontal: 14,
    ...shadow.paper,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13 },
  signOut: {
    fontFamily: sceneFont.uiText,
    ...scale.body,
    color: scene.creamMuted,
    textDecorationLine: 'underline',
  },
});
