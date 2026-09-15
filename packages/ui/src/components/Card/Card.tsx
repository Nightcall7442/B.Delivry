/**
 * Card component.
 *
 */
import { cx } from '../../cx.js';
import type { CardProps } from './Card.types.js';

export function Card({ elevated, interactive, className, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={cx(
        'rounded-panel bg-white',
        elevated ? 'shadow-card' : 'border border-line',
        interactive && 'transition-colors hover:border-brand-400',
        className,
      )}
    />
  );
}
