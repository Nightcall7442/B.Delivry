/** A path outside any locale (a mistyped asset, an old link): the same 404 in the same hall. */
import { BazaarNotFound } from '@/components/bazar/support';

export default function NotFound() {
  return <BazaarNotFound locale="ru" />;
}
