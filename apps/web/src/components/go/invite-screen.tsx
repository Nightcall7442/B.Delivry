/** Referral: my code to share, or a friend's code to enter before the first order. */
'use client';

import { isApiError } from '@bazar/api-client';
import { REFERRAL_BONUS_MINOR } from '@bazar/constants';
import { createT } from '@bazar/i18n';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { GoShell } from '@/components/go/go-shell';
import { useAuth } from '@/features/auth';
import { api } from '@/lib/api';

const REF_KEY = 'bazar.ref';

/** Remembers `?ref=` from a shared link until the visitor signs in. */
export function rememberReferral(code: string | null): void {
  try {
    if (code) window.localStorage.setItem(REF_KEY, code.toUpperCase());
  } catch {
    // private mode: the code is lost, the order still goes through
  }
}

export function InviteScreen({ locale }: { locale: string }) {
  const t = createT(locale);
  const { user, ready } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [friend, setFriend] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    api()
      .customers.referral()
      .then((r) => setCode(r.code))
      .catch(() => undefined);
    try {
      const remembered = window.localStorage.getItem(REF_KEY);
      if (remembered) setFriend(remembered);
    } catch {
      // ignore
    }
  }, [user]);

  const link = code ? `${window.location.origin}/${locale}?ref=${code}` : '';
  const apply = async () => {
    try {
      await api().customers.applyReferral(friend);
      setNote(t('invite.applied'));
      try {
        window.localStorage.removeItem(REF_KEY);
      } catch {
        // ignore
      }
    } catch (cause) {
      setNote(isApiError(cause) ? cause.message : t('common.error'));
    }
  };

  return (
    <GoShell
      locale={locale}
      back="history"
      expanded
      header={
        <h1 className="font-display text-[22px] font-extrabold leading-7">{t('invite.title')}</h1>
      }
    >
      <p className="mt-1 text-sm text-ink-muted">
        {t('invite.intro', { bonus: t.money(REFERRAL_BONUS_MINOR) })}
      </p>
      {!ready ? null : !user ? (
        <Link
          href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/invite`)}`}
          className="btn-go mt-4"
        >
          {t('common.signIn')}
        </Link>
      ) : (
        <>
          <div className="mt-4 flex flex-col items-center gap-2 rounded-2xl bg-sand-50 p-4">
            <span className="text-xs text-ink-muted">{t('invite.yourCode')}</span>
            <span className="font-display text-3xl font-extrabold tracking-[0.3em] text-brand-700">
              {code ?? '······'}
            </span>
            <button
              type="button"
              className="btn-go mt-2 h-11 w-full"
              disabled={!code}
              onClick={() => {
                void navigator.clipboard?.writeText(link).then(() => setCopied(true));
              }}
            >
              {copied ? t('invite.copied') : t('invite.share')}
            </button>
          </div>
          <p className="mt-4 text-xs text-ink-muted">{t('invite.haveCode')}</p>
          <div className="mt-2 flex gap-2">
            <input
              value={friend}
              onChange={(e) => setFriend(e.target.value.toUpperCase())}
              className="go-field h-11 flex-1 uppercase"
              placeholder={t('invite.codePlaceholder')}
            />
            <button
              type="button"
              className="btn-go-secondary h-11 px-4"
              disabled={friend.trim().length < 4}
              onClick={() => void apply()}
            >
              {t('invite.apply')}
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-muted">{note ?? t('invite.onlyBefore')}</p>
        </>
      )}
    </GoShell>
  );
}
