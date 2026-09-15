/**
 * EmptyState component.
 *
 */
import { cx } from '../../cx.js';
import type { EmptyStateProps } from './EmptyState.types.js';

export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center gap-3 rounded-panel border border-dashed border-line px-6 py-14 text-center',
        className,
      )}
    >
      {icon ? <div className="text-ink-faint">{icon}</div> : null}
      <p className="text-lg font-medium">{title}</p>
      {description ? <p className="max-w-sm text-sm text-ink-muted">{description}</p> : null}
      {action}
    </div>
  );
}
