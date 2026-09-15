/**
 * PaymentProvider factory.
 */
import type { PaymentProvider } from '@bazar/payments';
import type { PaymentsConfig } from '../../config/index.js';
import type { Logger } from '../../infrastructure/logger/index.js';
import { CashPaymentProvider } from './providers/cash.provider.js';
import { ClickPaymentProvider } from './providers/click.provider.js';
import { PaymePaymentProvider } from './providers/payme.provider.js';
import { UzumPaymentProvider } from './providers/uzum.provider.js';

export * from './payment-provider.interface.js';

/**
 * All configured providers at once, keyed by id, because a single order can
 * only use one but the platform serves all of them simultaneously — and a
 * webhook arrives for whichever provider sent it.
 *
 * Cash is always present: it is the fallback that needs no credentials, and
 * still the most common way a bazaar order is paid.
 */
export function createPaymentProviders(
  config: PaymentsConfig,
  logger: Logger,
): Map<string, PaymentProvider> {
  const providers = new Map<string, PaymentProvider>();

  providers.set('cash', new CashPaymentProvider());

  if (config.payme !== undefined) {
    providers.set('payme', new PaymePaymentProvider(config.payme, logger));
  }
  if (config.click !== undefined) {
    providers.set('click', new ClickPaymentProvider(config.click, logger));
  }
  if (config.uzum !== undefined) {
    providers.set('uzum', new UzumPaymentProvider(config.uzum, logger));
  }

  logger.info({ providers: [...providers.keys()] }, 'payment providers configured');

  return providers;
}
