/** Runs in the browser before the app. Two listeners; the SDK itself is fetched on the first error. */
import { watchGlobalErrors } from '@/lib/monitoring/client';

watchGlobalErrors();
