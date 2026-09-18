/** Anything under a locale that no route claims: a real 404, on the scene. */
import { notFound } from 'next/navigation';

export default function CatchAllPage() {
  notFound();
}
