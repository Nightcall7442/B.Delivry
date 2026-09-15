/**
 * Skeleton component.
 *
 * Size it with utility classes at the call site — a skeleton that does not
 * match the shape it replaces makes the load feel worse, not better.
 */
import { cx } from '../../cx.js';
import type { SkeletonProps } from './Skeleton.types.js';

export function Skeleton({ circle, className, ...rest }: SkeletonProps) {
  return (
    <div
      {...rest}
      aria-hidden
      className={cx(
        'animate-pulse bg-ink/[0.07]',
        circle ? 'rounded-full' : 'rounded-lg',
        className,
      )}
    />
  );
}
