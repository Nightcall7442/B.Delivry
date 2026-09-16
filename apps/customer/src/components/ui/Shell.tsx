/**
 * Screen frame. With a `map`: the map underneath, round buttons on top, the
 * sheet in front (address picking, order tracking). Without one: the
 * redesign's Page — gradient ground, header row, scrolling content.
 */
import { useRouter, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UI_LOCALES, type MessageKey } from '@bazar/i18n';

import { Page } from '@/components/ui/Page';
import { useCartCount } from '@/features/cart/store';
import {
  MapView,
  type MapViewProps,
  BottomSheet,
  type BottomSheetProps,
  ArrowLeft,
  Bag,
  Burger,
  Fab,
  Text,
  api,
  color,
  useAuth,
  useBrand,
  Chip,
  useLocale,
} from '@bazar/mobile';

export interface ShellProps extends Omit<BottomSheetProps, 'children'> {
  /** Omitted = no map, the screen is a plain Page. */
  map?: Omit<MapViewProps, 'inset'>;
  /** A translucent wash over the map (the kraft order slip warms the grey tiles). */
  tint?: string;
  /** Where the top-left arrow goes; omitted = burger menu. */
  back?: Href | 'history';
  children: ReactNode;
}

export function Shell({ map, back, peek = 0.46, tint, children, ...sheet }: ShellProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState(false);
  const count = useCartCount();
  const { locale, t, setLocale } = useLocale();
  const { user, ready, signOut } = useAuth();
  const brand = useBrand();

  // Pop when there is somewhere to pop to (keeps scroll and state); land on the
  // named screen only when the app was opened straight into this one.
  const goBack = () => {
    if (router.canGoBack()) return router.back();
    router.replace(back === 'history' || !back ? '/' : back);
  };

  if (!map) {
    return (
      <Page
        back={back ?? 'history'}
        header={<View style={{ flex: 1, minWidth: 0 }}>{sheet.header}</View>}
        footer={sheet.footer}
        cart
      >
        {children}
      </Page>
    );
  }

  return (
    <View style={s.root}>
      <MapView {...map} inset={peek} />
      {tint ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} /> : null}

      <View style={[s.top, { paddingTop: insets.top + 12 }]}>
        {back ? (
          <Fab onPress={goBack}>
            <ArrowLeft />
          </Fab>
        ) : (
          <Fab onPress={() => setMenu(true)}>
            <Burger />
          </Fab>
        )}
        <Fab onPress={() => router.push('/cart')} badge={count}>
          <Bag />
        </Fab>
      </View>

      <BottomSheet peek={peek} {...sheet}>
        {children}
      </BottomSheet>

      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={s.backdrop} onPress={() => setMenu(false)} />
        <View style={[s.menu, { paddingTop: insets.top + 20 }]}>
          <Text role="display">
            {brand.appName}
            <Text role="display" style={{ color: color.brand500 }}>
              .
            </Text>
          </Text>
          <View style={{ marginTop: 24 }}>
            {MENU.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => {
                  setMenu(false);
                  router.push(item.href);
                }}
                style={{ paddingVertical: 12 }}
              >
                <Text role="body" style={{ fontSize: 18 }}>
                  {t(item.key)}
                </Text>
              </Pressable>
            ))}
          </View>
          {user ? (
            <Pressable
              onPress={() => {
                setMenu(false);
                void api()
                  .notifications.telegramLink()
                  .then(({ url }) => Linking.openURL(url))
                  .catch(() => undefined);
              }}
              style={{ paddingVertical: 12 }}
            >
              <Text role="body" style={{ fontSize: 18 }}>
                {t('menu.telegram')}
              </Text>
              <Text role="caption">
                {user.telegramLinked ? t('menu.telegramLinked') : t('menu.telegramHint')}
              </Text>
            </Pressable>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {UI_LOCALES.map((code) => (
              <Chip
                key={code}
                label={code.toUpperCase()}
                active={code === locale}
                onPress={() => {
                  setLocale(code);
                  // The API speaks the same language back: SMS, push, the Telegram bot.
                  if (user)
                    void api()
                      .customers.updateUser({ locale: code })
                      .catch(() => undefined);
                }}
              />
            ))}
          </View>
          <View style={s.account}>
            {!ready ? null : user ? (
              <>
                <Text role="muted" numberOfLines={1} style={{ flex: 1 }}>
                  {user.phone}
                </Text>
                <Pressable
                  onPress={() => {
                    setMenu(false);
                    void signOut();
                  }}
                  hitSlop={8}
                >
                  <Text role="muted" style={{ textDecorationLine: 'underline' }}>
                    {t('common.signOut')}
                  </Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={() => {
                  setMenu(false);
                  router.push('/login');
                }}
                style={{ paddingVertical: 12 }}
              >
                <Text role="body" style={{ fontSize: 18, color: color.brand600 }}>
                  {t('common.signIn')}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const MENU: ReadonlyArray<{ href: Href; key: MessageKey }> = [
  { href: '/', key: 'menu.home' },
  { href: '/orders', key: 'menu.orders' },
  { href: '/list', key: 'menu.list' },
  { href: '/subscriptions', key: 'menu.subscriptions' },
  { href: '/business', key: 'menu.business' },
  { href: '/documents', key: 'menu.docs' },
  { href: '/neighbour', key: 'menu.neighbour' },
  { href: '/plus', key: 'menu.plus' },
  { href: '/invite', key: 'menu.invite' },
  { href: '/address', key: 'menu.address' },
  { href: '/search', key: 'menu.search' },
  { href: '/support', key: 'menu.support' },
  { href: '/rules', key: 'menu.rules' },
];

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.sand100 },
  account: {
    marginTop: 'auto',
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 10,
    pointerEvents: 'box-none',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(27,31,34,0.4)' },
  menu: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '82%',
    maxWidth: 320,
    backgroundColor: color.surface,
    paddingHorizontal: 20,
  },
});
