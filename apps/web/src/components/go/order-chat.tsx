/** The order's thread: customer and courier, a few lines each. */
'use client';

import { room } from '@bazar/api-client';
import { createT } from '@bazar/i18n';
import { WS_EVENT, type ChatMessageDto } from '@bazar/types';
import { useEffect, useRef, useState } from 'react';

import { api } from '@/lib/api';

export function OrderChat({
  orderId,
  locale,
  onClose,
}: {
  orderId: string;
  locale: string;
  onClose: () => void;
}) {
  const t = createT(locale);
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api()
      .orders.messages(orderId)
      .then(setMessages)
      .catch(() => undefined);
    const realtime = api().realtime;
    void realtime.connect();
    realtime.join(room.order(orderId));
    return realtime.on(WS_EVENT.ORDER_MESSAGE, (message) => {
      if (message.orderId !== orderId) return;
      setMessages((current) =>
        current.some((m) => m.id === message.id) ? current : [...current, message],
      );
    });
  }, [orderId]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    try {
      const message = await api().orders.sendMessage(orderId, text);
      setMessages((current) =>
        current.some((m) => m.id === message.id) ? current : [...current, message],
      );
      setDraft('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-3 rounded-2xl bg-surface-raise p-3 shadow-pop">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-bold">{t('chat.title')}</h2>
        <button type="button" className="text-sm text-ink-muted" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
      <div ref={list} className="mt-2 flex max-h-56 flex-col gap-1.5 overflow-y-auto py-1">
        {messages.length === 0 ? <p className="text-xs text-ink-muted">{t('chat.empty')}</p> : null}
        {messages.map((message) => {
          const mine = message.senderRole === 'CUSTOMER';
          return (
            <div
              key={message.id}
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? 'self-end rounded-br-sm bg-brand-500 text-white' : 'self-start rounded-bl-sm bg-sand-100'}`}
            >
              <p>{message.text}</p>
              <p className={`mt-0.5 text-[10px] ${mine ? 'text-white/75' : 'text-ink-muted'}`}>
                {new Date(message.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          );
        })}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="go-field h-11 flex-1"
          placeholder={t('chat.placeholder')}
        />
        <button type="submit" className="btn-go h-11 px-4" disabled={busy || !draft.trim()}>
          {t('chat.send')}
        </button>
      </form>
    </section>
  );
}
