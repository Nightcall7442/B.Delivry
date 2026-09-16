'use client';
/**
 * A film you scrub with the scroll wheel — the Apple product-page trick. The
 * track is `height` viewports tall; inside it a sticky viewport holds a canvas
 * that shows frame ⌊progress × frames⌋. Frames are plain image files
 * (`src(i)`), preloaded a few at a time, the first one first so the page has
 * a picture before the rest arrive. Children get the progress to place copy.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

import styles from './promo.module.css';

const PARALLEL = 6;

export function ScrollFilm({
  id,
  frames,
  src,
  height = 300,
  children,
}: {
  id?: string;
  frames: number;
  src: (index: number) => string;
  /** Scroll track height in viewport heights: more = slower scrub. */
  height?: number;
  children: (progress: number) => ReactNode;
}) {
  const track = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = track.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const images: HTMLImageElement[] = [];
    let shown = -1;
    let wanted = 0;

    // Cover-fit the frame into the canvas, like `object-fit: cover`.
    const draw = (index: number) => {
      const img = images[index];
      if (!img?.complete || !img.naturalWidth) return;
      const { width, height } = cv;
      const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
      shown = index;
    };
    // The nearest loaded frame at or below the wanted one, so scrubbing never blanks.
    const show = () => {
      for (let i = wanted; i >= 0; i -= 1) {
        if (images[i]?.complete && images[i]?.naturalWidth) {
          if (i !== shown) draw(i);
          return;
        }
      }
    };

    const load = (index: number) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          if (index === wanted || shown < 0) show();
          resolve();
        };
        img.onerror = () => resolve();
        img.src = src(index);
        images[index] = img;
      });
    let cancelled = false;
    void load(0).then(async () => {
      let next = 1;
      const worker = async () => {
        while (!cancelled && next < frames) {
          const i = next;
          next += 1;
          await load(i);
        }
      };
      await Promise.all(Array.from({ length: PARALLEL }, worker));
    });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(window.innerWidth * dpr);
      cv.height = Math.round(window.innerHeight * dpr);
      shown = -1;
      show();
    };
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const rect = el.getBoundingClientRect();
        const travel = rect.height - window.innerHeight;
        const p = Math.min(1, Math.max(0, travel > 0 ? -rect.top / travel : 0));
        wanted = Math.round(p * (frames - 1));
        show();
        setProgress((prev) => (Math.abs(prev - p) > 0.002 || p === 0 || p === 1 ? p : prev));
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
    };
  }, [frames, src]);

  return (
    <section id={id} ref={track} className={styles.track} style={{ height: `${height}vh` }}>
      <div className={styles.sticky}>
        <canvas ref={canvas} className={styles.canvas} style={{ backgroundImage: `url(${src(0)})` }} />
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
export function reveal(p: number, from: number, to: number, ease = 0.08) {
  const fadeIn = from <= 0 ? 1 : Math.min(1, Math.max(0, (p - from) / ease));
  const fadeOut = to >= 1 ? 1 : Math.min(1, Math.max(0, (to - p) / ease));
  const o = Math.min(fadeIn, fadeOut);
  return {
    opacity: o,
    transform: `translateY(${(1 - fadeIn) * 24 - (1 - fadeOut) * 12}px)`,
    pointerEvents: o > 0.5 ? ('auto' as const) : ('none' as const),
  };
}
