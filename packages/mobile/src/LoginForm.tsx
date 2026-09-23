/**
 * Sign in by phone: number → six digits → done. Just the form; the app around
 * it decides what sits behind (the customer's map, the courier's plain panel)
 * and where to go once `onSignedIn` fires.
 */
import { isApiError } from '@bazar/api-client';
import type { MessageKey, T } from '@bazar/i18n';
import type { CurrentUserDto } from '@bazar/types';
import type { OtpChannel } from '@bazar/types';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from './auth';
import { useT } from './locale';
import { Button, Field, Text } from './primitives';
import { color } from './theme';

const KNOWN_ERRORS = [
  'INVALID_OTP',
  'OTP_EXPIRED',
  'OTP_ATTEMPTS_EXCEEDED',
  'OTP_COOLDOWN',
  'RATE_LIMITED',
  'ACCOUNT_BLOCKED',
  'NETWORK',
  'VALIDATION',
];

const describe = (t: T, error: unknown): string =>
  isApiError(error)
    ? KNOWN_ERRORS.includes(error.code)
      ? t(`login.error.${error.code}` as MessageKey)
      : error.message
    : t('login.error.default');

/** "90 123 45 67" and "+998901234567" both become +998901234567. */
const normalize = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  return `+${digits.startsWith('998') ? digits : `998${digits}`}`;
};

export function LoginForm({
  title,
  onSignedIn,
}: {
  title?: string;
  onSignedIn: (user: CurrentUserDto) => void;
}) {
  const t = useT();
  const { requestCode, verifyCode, startTelegramLogin, telegramLogin } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code' | 'telegram'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryIn, setRetryIn] = useState(0);
  const [codeLength, setCodeLength] = useState(6);
  const [channel, setChannel] = useState<OtpChannel>('sms');
  const [ticket, setTicket] = useState<string | null>(null);
  const codeInput = useRef<TextInput>(null);

  useEffect(() => {
    if (retryIn <= 0) return;
    const timer = setTimeout(() => setRetryIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [retryIn]);

  // While the person is in the bot, ask every two seconds whether it is done —
  // and once more the moment they come back to the app.
  useEffect(() => {
    if (ticket === null) return;
    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      try {
        const user = await telegramLogin(ticket);
        if (user && !stopped) {
          stopped = true;
          onSignedIn(user);
        }
      } catch {
        if (!stopped) {
          stopped = true;
          setTicket(null);
          setStep('phone');
          setError(t('login.telegramExpired'));
        }
      }
    };
    const timer = setInterval(() => void poll(), 2000);
    const sub = AppState.addEventListener('change', (state) => state === 'active' && void poll());
    return () => {
      stopped = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [ticket, telegramLogin, onSignedIn, t]);

  const send = async (force?: OtpChannel) => {
    setBusy(true);
    setError(null);
    try {
      const result = await requestCode(normalize(phone), force);
      setRetryIn(result.retryAfter);
      setCodeLength(result.codeLength);
      setChannel(result.channel);
      setStep('code');
      setTimeout(() => codeInput.current?.focus(), 50);
    } catch (cause) {
      setError(describe(t, cause));
    } finally {
      setBusy(false);
    }
  };

  const viaTelegram = async () => {
    setBusy(true);
    setError(null);
    try {
      const started = await startTelegramLogin();
      setTicket(started.code);
      setStep('telegram');
      await Linking.openURL(started.url);
    } catch (cause) {
      setError(describe(t, cause));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await verifyCode(normalize(phone), code.trim()));
    } catch (cause) {
      setError(describe(t, cause));
      setBusy(false);
    }
  };

  const full = normalize(phone);

  return (
    <View style={s.root}>
      <Text role="display">
        {step === 'phone'
          ? (title ?? t('login.title'))
          : step === 'telegram'
            ? t('login.viaTelegram')
            : channel === 'telegram'
              ? t('login.codeTelegram')
              : t('login.code')}
      </Text>
      <Text role="muted">
        {step === 'phone'
          ? t('login.hint')
          : step === 'telegram'
            ? t('login.telegramWait')
            : channel === 'telegram'
              ? t('login.sentTelegram', { count: codeLength })
              : t('login.sent', { count: codeLength, phone: full })}
      </Text>

      {step === 'phone' ? (
        <>
          <Button
            label={t('login.viaTelegram')}
            disabled={busy}
            onPress={() => void viaTelegram()}
          />
          <Text role="caption" style={s.why}>
            {t('login.telegramWhy')}
          </Text>
          <Text role="caption" style={s.or}>
            {t('login.orPhone')}
          </Text>
        </>
      ) : null}

      {step === 'phone' ? (
        <Field
          leading={<Text style={s.prefix}>+998</Text>}
          value={phone}
          onChangeText={setPhone}
          placeholder="90 123 45 67"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          autoFocus
          onSubmitEditing={() => void send()}
          returnKeyType="done"
          style={s.field}
        />
      ) : step === 'telegram' ? (
        <Text
          role="muted"
          style={s.link}
          onPress={() => {
            setTicket(null);
            setStep('phone');
          }}
        >
          {t('login.sendSms')}
        </Text>
      ) : (
        <>
          <Field
            ref={codeInput}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, codeLength))}
            placeholder={'•'.repeat(codeLength)}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            onSubmitEditing={() => void verify()}
            returnKeyType="done"
            style={s.field}
          />
          <View style={s.links}>
            <Text
              role="muted"
              onPress={() => {
                setStep('phone');
                setCode('');
                setError(null);
              }}
            >
              {t('login.otherPhone')}
            </Text>
            <Text
              role="muted"
              style={retryIn > 0 ? s.dim : s.link}
              onPress={
                retryIn > 0 || busy
                  ? undefined
                  : () => void send(channel === 'telegram' ? 'sms' : undefined)
              }
            >
              {retryIn > 0
                ? t('login.retryIn', { seconds: retryIn })
                : channel === 'telegram'
                  ? t('login.sendSms')
                  : t('login.resend')}
            </Text>
          </View>
        </>
      )}

      {error ? <Text style={s.error}>{error}</Text> : null}

      {step !== 'telegram' ? (
        <Button
          {...(step === 'phone' ? { variant: 'secondary' as const } : {})}
          label={busy ? t('login.wait') : step === 'phone' ? t('login.getCode') : t('login.enter')}
          disabled={busy || (step === 'phone' ? full.length < 13 : code.length < codeLength)}
          onPress={() => void (step === 'phone' ? send() : verify())}
          style={s.button}
        />
      ) : null}
      <Text
        role="caption"
        style={s.legal}
        onPress={() => void Linking.openURL('https://bazar-delivery.uz/ru/offer')}
      >
        {t('login.terms')}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { gap: 8 },
  prefix: { fontSize: 16, color: color.inkMuted, marginRight: 8 },
  field: { marginTop: 12 },
  links: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  link: { color: color.brand600 },
  dim: { color: color.inkFaint },
  error: { color: color.danger, fontSize: 14 },
  button: { marginTop: 8 },
  // Why the bot is first, and the dashed rule before the other way in.
  why: { textAlign: 'center', marginTop: -2 },
  or: {
    textAlign: 'center',
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#C9B99A',
  },
  legal: { textAlign: 'center', marginTop: 4 },
});
