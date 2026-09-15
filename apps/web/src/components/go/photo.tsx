/**
 * A product or store photograph in a rounded frame, with the sand tint behind
 * it while it loads and when there is none. One component so every thumbnail
 * on the sheets has the same frame, ratio and fallback.
 */
import Image from 'next/image';
import type { ReactNode } from 'react';

export function Photo({
  src,
  alt,
  sizes,
  className = '',
  fallback,
  priority = false,
}: {
  src: string | null | undefined;
  alt: string;
  /** The `sizes` hint next/image needs to pick a width. */
  sizes: string;
  className?: string;
  /** Shown when there is no photograph: an icon, never an emoji. */
  fallback?: ReactNode;
  priority?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden bg-surface-mute ${className}`}>
      {src ? (
        // Commons already serves the exact thumbnail ladder and throttles proxies without
        // a browser User-Agent, so the optimizer would only add a 429 in between.
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          unoptimized
          className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sand-300">
          {fallback}
        </div>
      )}
    </div>
  );
}
