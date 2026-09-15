/**
 * Root page (redirect to default locale / dashboard).
 *
 */
import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/ru');
}
