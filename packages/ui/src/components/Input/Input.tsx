/**
 * Input component.
 *
 * One recipe used site-wide: a 56px tinted box with no border, the label shrunk
 * to 12px above the value, and focus swapping the tint for white plus a 2px
 * brand outline. Borders appear only on error.
 */
'use client';

import { forwardRef, useId } from 'react';

import { cx } from '../../cx.js';
import type { InputProps } from './Input.types.js';

export const CONTROL =
  'relative flex h-14 w-full flex-col justify-center rounded-lg bg-ink/[0.04] px-3.5 py-1.5 ' +
  'shadow-[inset_0_1px_2px_rgba(0,33,52,0.05)] outline outline-2 outline-offset-[-2px] outline-transparent ' +
  'transition-colors hover:bg-brand-500/10 focus-within:bg-white focus-within:outline-brand-500';

export const CONTROL_ERROR =
  'bg-danger/5 hover:bg-danger/10 focus-within:bg-white focus-within:outline-danger';

export const CONTROL_LABEL = 'pointer-events-none text-xs leading-4 text-ink-muted';

export const CONTROL_VALUE =
  'w-full bg-transparent text-base leading-6 text-ink outline-none placeholder:text-ink-faint';

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, adornment, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <div className={cx('w-full', className)}>
      <label htmlFor={inputId} className={cx(CONTROL, error && CONTROL_ERROR)}>
        <span className={CONTROL_LABEL}>{label}</span>
        <span className="flex items-center gap-2">
          <input
            {...rest}
            id={inputId}
            ref={ref}
            aria-invalid={error ? true : undefined}
            className={CONTROL_VALUE}
          />
          {adornment}
        </span>
      </label>
      {error ? <p className="mt-1 px-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
});
