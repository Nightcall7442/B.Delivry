/**
 * Tabs component.
 *
 * Scrolls horizontally rather than wrapping: a bazaar has more categories than
 * fit on a phone, and a wrapping tab strip pushes the goods below the fold.
 * Arrow keys move between tabs, which is what the tablist role promises.
 */
'use client';

import { useRef } from 'react';

import { cx } from '../../cx.js';
import type { TabsProps } from './Tabs.types.js';

export function Tabs({ items, value, onChange, className, ...rest }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const index = items.findIndex((item) => item.id === value);
    const next = items[(index + delta + items.length) % items.length];
    if (!next) return;
    onChange(next.id);
    listRef.current?.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.focus();
  }

  return (
    <div
      {...rest}
      ref={listRef}
      role="tablist"
      onKeyDown={onKeyDown}
      className={cx(
        'flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            data-tab={item.id}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cx(
              'whitespace-nowrap rounded-full px-4 py-2 text-sm transition-colors',
              selected
                ? 'bg-brand-500 text-white'
                : 'bg-ink/5 text-ink hover:bg-brand-50 hover:text-brand-700',
            )}
          >
            {item.label}
            {item.count === undefined ? null : (
              <span className={cx('ml-1.5', selected ? 'text-white/70' : 'text-ink-faint')}>
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
