/** Anything under a locale that no route claims: a real 404, in the hall ([locale]/not-found). */
import { notFound } from 'next/navigation';

export default function CatchAllPage() {
  notFound();
}
