/**
 * Card props.
 *
 */
import type { HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Lift the card off the page instead of outlining it. */
  elevated?: boolean;
  /** Hover affordance for cards that are themselves a link target. */
  interactive?: boolean;
}
