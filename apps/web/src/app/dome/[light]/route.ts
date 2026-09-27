/**
 * The girih of the dome as a background tile (`/dome/morning.svg`, `/dome/evening.svg`): drawn
 * once at build time from @bazar/storefront's generator and served as a cached image, so the
 * hall costs the page no script. `.hall` in globals.css lays it under every screen.
 */
import { girihSvg, type HallLight } from '@bazar/storefront';

export const dynamic = 'force-static';
export const dynamicParams = false;

const LIGHTS: readonly HallLight[] = ['morning', 'evening'];

export function generateStaticParams() {
  return LIGHTS.map((light) => ({ light: `${light}.svg` }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ light: string }> }) {
  const light = (await params).light.replace(/\.svg$/, '') as HallLight;
  if (!LIGHTS.includes(light)) return new Response(null, { status: 404 });
  return new Response(girihSvg(light), {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
}
