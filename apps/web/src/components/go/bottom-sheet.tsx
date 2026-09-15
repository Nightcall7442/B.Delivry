/**
 * The GO-style sheet: a white panel over the map with a drag handle.
 *
 * Mobile: fixed to the bottom, two snap points (peek / full), dragged by the
 * handle or the header; the sheet changes *height*, not offset, so the footer
 * button stays on screen in both states. Desktop: a floating left panel, no
 * gesture. One component, one DOM tree — the breakpoint only changes CSS.
 *
 * ponytail: two snap points, no velocity. Add a middle snap when a screen needs it.
 */
'use client';

import { createT } from '@bazar/i18n';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';

export interface BottomSheetProps {
  /** Language for the sheet's own labels. */
  locale?: string;
  /** Share of the viewport the collapsed sheet occupies on mobile. */
  peek?: number;
  /** Start expanded (screens that are a list, not a map). */
  expanded?: boolean;
  /** Always-visible part: title, address row, search. */
  header?: ReactNode;
  /** Pinned under the scrolling body: the primary button. */
  footer?: ReactNode;
  children: ReactNode;
}

/** Room above the expanded sheet for the round back/cart buttons. */
const TOP_GAP = 68;
const DESKTOP = '(min-width: 768px)';

export function BottomSheet({
  peek = 0.46,
  expanded: initial = false,
  header,
  footer,
  children,
  locale = 'ru',
}: BottomSheetProps) {
  const t = createT(locale);
  const [expanded, setExpanded] = useState(initial);
  const [viewport, setViewport] = useState({ height: 0, desktop: true, reducedMotion: false });
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startHeight: number } | null>(null);

  useEffect(() => {
    const measure = () =>
      setViewport({
        height: window.innerHeight,
        desktop: window.matchMedia(DESKTOP).matches,
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      });
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const { reducedMotion } = viewport;
  const full = Math.max(0, viewport.height - TOP_GAP);
  const peekHeight = Math.round(viewport.height * peek);
  const restHeight = expanded ? full : peekHeight;
  const height = dragHeight ?? restHeight;

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (viewport.desktop) return;
      drag.current = { startY: event.clientY, startHeight: restHeight };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [restHeight, viewport.desktop],
  );
  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const start = drag.current;
      if (!start) return;
      const next = start.startHeight - (event.clientY - start.startY);
      setDragHeight(Math.min(full, Math.max(peekHeight, next)));
    },
    [full, peekHeight],
  );
  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const start = drag.current;
      drag.current = null;
      if (!start) return;
      const moved = start.startY - event.clientY;
      // A tap on the handle toggles; a drag snaps to the nearer edge.
      if (Math.abs(moved) < 6) setExpanded((value) => !value);
      else setExpanded(start.startHeight + moved > (full + peekHeight) / 2);
      setDragHeight(null);
    },
    [full, peekHeight],
  );

  return (
    <section
      className="go-sheet fixed inset-x-0 bottom-0 z-20 flex flex-col rounded-t-3xl bg-surface shadow-pop md:inset-auto md:bottom-4 md:left-4 md:top-4 md:w-[420px] md:rounded-3xl"
      style={
        viewport.desktop || !viewport.height
          ? undefined
          : {
              height,
              transition:
                dragHeight === null ? 'height 260ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none',
            }
      }
      data-expanded={expanded}
    >
      <div
        className="shrink-0 cursor-grab touch-none px-4 pt-2 active:cursor-grabbing md:cursor-default"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <button
          type="button"
          className="mx-auto block h-1.5 w-10 rounded-full bg-sand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 md:hidden"
          aria-label={expanded ? t('sheet.collapse') : t('sheet.expand')}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        />
        {header ? <div className="pt-3">{header}</div> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>

      {footer ? (
        <div className="shrink-0 border-t border-line bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:rounded-b-3xl">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
