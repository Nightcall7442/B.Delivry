'use client';
/**
 * A film you scrub with the scroll wheel — the Apple product-page trick. The
 * track is `height` viewports tall; inside it a sticky viewport holds a canvas
 * that shows the frame `toFrame(progress)` picks (linear by default; the
 * landing maps its segments onto the track so a bridge can scrub faster than
 * a scene). Frames are plain image files (`src(i)`), loaded nearest-first
 * around where the reader is, so the picture under the thumb arrives before
 * the rest. The shown frame eases towards the wanted one, so a flick of the
 * wheel plays as motion rather than a jump. Children get the progress to
 * place copy.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

import styles from './promo.module.css';

const PARALLEL = 6;

export function ScrollFilm({
  id,
  frames,
  src,
  height = 300,
  toFrame,
  onLoad,
  children,
}: {
  id?: string;
  frames: number;
  src: (index: number) => string;
  /** Scroll track height in viewport heights: more = slower scrub. */
  height?: number;
  /** Progress 0..1 → frame index; linear when omitted. */
  toFrame?: (progress: number) => number;
  /** Loaded-frame count, for a progress line. */
  onLoad?: (loaded: number, total: number) => void;
  children: (progress: number) => ReactNode;
}) {
  const track = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [progress, setProgress] = useState(0);
  const map = useRef(toFrame);
  map.current = toFrame;
  const load = useRef(onLoad);
  load.current = onLoad;

  useEffect(() => {
    const el = track.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const images: (HTMLImageElement | undefined)[] = [];
    const ready: boolean[] = [];
    let loaded = 0;
    let shown = -1;
    let wanted = 0;
    let current = 0;
    let cancelled = false;

    // Cover-fit the frame into the canvas, like `object-fit: cover`.
    const draw = (index: number) => {
      const img = images[index];
      if (!img || !ready[index]) return;
      const { width, height } = cv;
      const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
      shown = index;
    };
    // The nearest loaded frame at or below the one we want, so scrubbing never blanks.
    const show = (index: number) => {
      for (let i = index; i >= 0; i -= 1) {
        if (ready[i]) {
          if (i !== shown) draw(i);
          return;
        }
      }
    };

    // Ease the shown frame towards the wanted one.
    let motion = 0;
    const settle = () => {
      motion = 0;
      const gap = wanted - current;
      if (Math.abs(gap) < 0.45) {
        current = wanted;
      } else {
        current += gap * 0.28;
        motion = requestAnimationFrame(settle);
      }
      show(Math.round(current));
    };
    const nudge = () => {
      if (!motion) motion = requestAnimationFrame(settle);
    };

    // Nearest-first loading: whichever unloaded frame is closest to the reader.
    const pending = new Set(Array.from({ length: frames }, (_, i) => i));
    const next = () => {
      let best = -1;
      let dist = Infinity;
      for (const i of pending) {
        const d = Math.abs(i - wanted);
        if (d < dist) {
          dist = d;
          best = i;
        }
      }
      return best;
    };
    const fetchOne = (index: number) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          ready[index] = true;
          loaded += 1;
          load.current?.(loaded, frames);
          if (index <= Math.round(current) || shown < 0) nudge();
          resolve();
        };
        img.onerror = () => resolve();
        img.src = src(index);
        images[index] = img;
      });
    const worker = async () => {
      while (!cancelled) {
        const i = next();
        if (i < 0) return;
        pending.delete(i);
        await fetchOne(i);
      }
    };
    // The first frame alone, then the pool — the page has a picture before the rest arrive.
    pending.delete(0);
    void fetchOne(0).then(() => Promise.all(Array.from({ length: PARALLEL }, worker)));

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(window.innerWidth * dpr);
      cv.height = Math.round(window.innerHeight * dpr);
      shown = -1;
      show(Math.round(current));
    };
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const rect = el.getBoundingClientRect();
        const travel = rect.height - window.innerHeight;
        const p = Math.min(1, Math.max(0, travel > 0 ? -rect.top / travel : 0));
        const target = map.current ? map.current(p) : p * (frames - 1);
        wanted = Math.min(frames - 1, Math.max(0, Math.round(target)));
        nudge();
        setProgress((prev) => (Math.abs(prev - p) > 0.0015 || p === 0 || p === 1 ? p : prev));
      });
    };
    resize();
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', resize);
    return () => {
      cancelled = true;
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', resize);
      if (raf) cancelAnimationFrame(raf);
      if (motion) cancelAnimationFrame(motion);
    };
  }, [frames, src]);

  return (
    <section id={id} ref={track} className={styles.track} style={{ height: `${height}vh` }}>
      <div className={styles.sticky}>
        <canvas ref={canvas} className={styles.canvas} style={{ backgroundImage: `url(${src(0)})` }} />
        <div className={styles.grain} />
        {children(progress)}
      </div>
    </section>
  );
}

/**
 * Opacity + lift for a caption that lives between `from` and `to` of the
 * scrub. A caption starting at 0 is already up when the page opens; one
 * ending at 1 stays up at the end of the track.
 */
export function reveal(p: number, from: number, to: number, ease = 0.035) {
  const fadeIn = from <= 0 ? 1 : Math.min(1, Math.max(0, (p - from) / ease));
  const fadeOut = to >= 1 ? 1 : Math.min(1, Math.max(0, (to - p) / ease));
  const o = Math.min(fadeIn, fadeOut);
  return {
    opacity: o,
    transform: `translateY(${(1 - fadeIn) * 28 - (1 - fadeOut) * 14}px)`,
    pointerEvents: o > 0.5 ? ('auto' as const) : ('none' as const),
  };
}
