import { headers } from 'next/headers';

import { DEFAULT_BRAND } from '@/features/branding';
import { serverApi } from '@/lib/api';

/** White-label: the brand behind the host the browser opened (the default tenant otherwise). */
export async function currentTenant() {
  const host = (await headers()).get('host') ?? undefined;
  try {
    return await serverApi().tenants.current(host);
  } catch {
    return DEFAULT_BRAND;
  }
}
