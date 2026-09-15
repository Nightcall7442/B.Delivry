/**
 * Select component.
 *
 * A native <select> on purpose: on a phone it opens the OS picker, which beats
 * any hand-rolled dropdown for reach, keyboard support and screen readers.
 * Only the chevron is ours.
 */
'use client';

import { forwardRef, useId } from 'react';

import { cx } from '../../cx.js';
import { CONTROL, CONTROL_LABEL, CONTROL_VALUE } from '../Input/Input.js';
import type { SelectProps } from './Select.types.js';

export const ChevronDown = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
    <path
      d="m6 9 6 6 6-6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;

  return (
    <div className={cx('w-full', className)}>
      <label htmlFor={selectId} className={CONTROL}>
        <span className={CONTROL_LABEL}>{label}</span>
        <span className="flex items-center gap-2">
          <select
            {...rest}
            id={selectId}
            ref={ref}
            className={cx(CONTROL_VALUE, 'appearance-none pr-6')}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3.5 h-5 w-5 text-ink-muted" />
        </span>
      </label>
    </div>
  );
});
