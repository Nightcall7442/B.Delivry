/**
 * Badge props.
 *
 */
import type { HTMLAttributes } from 'react';

export type BadgeTone = 'neutral' | 'brand' | 'accent' | 'danger' | 'muted';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}
