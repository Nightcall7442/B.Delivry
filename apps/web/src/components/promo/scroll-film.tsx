'use client';
/**
 * A film you scrub with the scroll wheel — the Apple product-page trick. The
 * track is `height` viewports tall; inside it a sticky viewport holds a canvas
 * that shows the frame `toFrame(progress)` picks (linear by default; the
 * landing maps its shots onto the track so one can scrub faster than another).
 * Frames come in strips — `per` frames stacked in one WebP (`strip(k)`) — so a
 * 96-frame shot is a dozen requests, not a hundred; strips load nearest-first
 * around the reader. Until the film is in, a veil shows the poster and how
 * much has arrived; the shown frame eases towards the wanted one and
 * dissolves between neighbouring frames, so a flick of the wheel plays as
 * motion rather than a jump. Children get the progress to place copy.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

import styles from './promo.module.css';

const PARALLEL = 4;

export function ScrollFilm({
  id,
  frames,
  per,
  strip,
  poster,
  height = 300,
  toFrame,
  loading,
  children,
}: {
  id?: string;
  frames: number;
  /** Frames per strip. */
  per: number;
  /** Strip index → file. */
  strip: (index: number) => string;
  /** First frame alone, for the veil and the canvas background. */
  poster: string;
  /** Scroll track height in viewport heights: more = slower scrub. */
  height?: number;
  /** Progress 0..1 → frame index; linear when omitted. */
  toFrame?: (progress: number) => number;
  /** The veil's line: «Открываем ряд». */
  loading: string;
  children: (progress: number) => ReactNode;
}) {
  const track = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [progress, setProgress] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const map = useRef(toFrame);
  map.current = toFrame;
  const strips = Math.ceil(frames / per);

  useEffect(() => {
    const el = track.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const images: (HTMLImageElement | undefined)[] = [];
    const ready: boolean[] = [];
    let done = 0;
    let shown = -1;
    let wanted = 0;
    let current = 0;
    let cancelled = false;

    // Cover-fit one frame of its strip into the canvas, like `object-fit: cover`.
    const drawFrame = (index: number, alpha = 1) => {
      const img = images[Math.floor(index / per)];
      if (!img) return;
      const fw = img.naturalWidth;
      const fh = img.naturalHeight / per;
      const { width, height } = cv;
      const scale = Math.max(width / fw, height / fh);
      const w = fw * scale;
      const h = fh * scale;
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, 0, (index % per) * fh, fw, fh, (width - w) / 2, (height - h) / 2, w, h);
      ctx.globalAlpha = 1;
    };
    // The nearest loaded frame at or below the one we want, so scrubbing never blanks.
    const nearestReady = (index: number) => {
      for (let i = index; i >= 0; i -= 1) if (ready[Math.floor(i / per)]) return i;
      return -1;
    };
    // The film is 12 fps; a fractional position dissolves between the two neighbouring
    // frames, so the scrub reads as continuous motion instead of steps.
    const show = (pos: number) => {
      const a = Math.floor(pos);
      const frac = pos - a;
      const base = nearestReady(a);
      if (base < 0 || Math.abs(pos - shown) < 0.01) return;
      drawFrame(base);
      if (base === a && frac > 0.02 && a + 1 < frames && ready[Math.floor((a + 1) / per)]) {
        drawFrame(a + 1, frac);
      }
      shown = pos;
    };

    // Ease the shown frame towards the wanted one — time-based, so it feels the same at
    // 60 and 120 Hz: about 140 ms to close most of the gap.
    let motion = 0;
    let last = 0;
    const settle = (now: number) => {
      motion = 0;
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      // Dissolves are for motion: once close, land on a whole frame so the still is crisp.
      const goal = Math.abs(wanted - current) < 0.6 ? Math.round(wanted) : wanted;
      const gap = goal - current;
      if (Math.abs(gap) < 0.005) {
        current = goal;
        last = 0;
      } else {
        current += gap * (1 - Math.exp(-dt / 140));
        motion = requestAnimationFrame(settle);
      }
      show(current);
    };
    const nudge = () => {
      if (!motion) motion = requestAnimationFrame(settle);
    };

    // Nearest-first loading: whichever unloaded strip is closest to the reader.
    const pending = new Set(Array.from({ length: strips }, (_, i) => i));
    const next = () => {
      const here = Math.floor(wanted / per);
      let best = -1;
      let dist = Infinity;
      for (const i of pending) {
        const d = Math.abs(i - here);
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
          done += 1;
          setLoaded(done / strips);
          if (index <= Math.floor(current / per) || shown < 0) nudge();
          resolve();
        };
        img.onerror = () => resolve();
        img.src = strip(index);
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
    void Promise.all(Array.from({ length: PARALLEL }, worker));

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      cv.width = Math.round(window.innerWidth * dpr);
      cv.height = Math.round(window.innerHeight * dpr);
      // Resizing resets the context state; the frames are Full HD and get scaled either way.
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      shown = -1;
      show(current);
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
        wanted = Math.min(frames - 1, Math.max(0, target));
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
  }, [frames, per, strip, strips]);

  const veiled = loaded < 1;
  return (
    <section id={id} ref={track} className={styles.track} style={{ height: `${height}vh` }}>
      <div className={styles.sticky}>
        <canvas
          ref={canvas}
          className={styles.canvas}
          style={{ backgroundImage: `url(${poster})` }}
        />
        <div className={styles.grain} />
        {children(progress)}
        <div
          className={styles.veil}
          style={{ opacity: veiled ? 1 : 0, pointerEvents: veiled ? 'auto' : 'none' }}
          aria-hidden={!veiled}
        >
          <div className={styles.veilLine}>{loading}</div>
          <div className={styles.veilBar}>
            <i style={{ transform: `scaleX(${loaded})` }} />
          </div>
          <div className={styles.veilPct}>{Math.round(loaded * 100)} %</div>
        </div>
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
