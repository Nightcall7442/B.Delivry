/**
 * EmptyState props.
 *
 */
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** The way out. An empty state without one is a dead end. */
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}
