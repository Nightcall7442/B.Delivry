/**
 * Badge component.
 *
 * A label, never a button. If it needs to be clickable it is the wrong element.
 */
import { cx } from '../../cx.js';
import type { BadgeProps, BadgeTone } from './Badge.types.js';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-ink/5 text-ink',
  brand: 'bg-brand-50 text-brand-700',
  accent: 'bg-saffron-100 text-saffron-600',
  danger: 'bg-danger/10 text-danger',
  muted: 'bg-white/15 text-white',
};

export function Badge({ tone = 'neutral', className, ...rest }: BadgeProps) {
  return (
    <span
      {...rest}
      className={cx(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium leading-4',
        TONES[tone],
        className,
      )}
    />
  );
}
