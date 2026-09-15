/**
 * Expire carts, OTPs, stale sessions, old locations.
 */
import { LIMITS } from '@bazar/constants';
import type { Container } from '../../app/container.js';
import type { CleanupJob } from '../queues.js';

/** Raw GPS pings are only useful while a delivery dispute is still live. */
const LOCATION_RETENTION_DAYS = 30;

/**
 * Housekeeping. Each sweep is bounded and idempotent, so a missed run costs
 * nothing but disk and the next run catches up.
 */
export function cleanupJob(container: Container) {
  return async (payload: CleanupJob): Promise<void> => {
    const { prisma, logger } = container;
    const now = new Date();

    switch (payload.target) {
      case 'carts': {
        // A cart nobody came back to within its TTL is not coming back.
        const cutoff = new Date(now.getTime() - LIMITS.CART_TTL_HOURS * 3600 * 1000);
        const { count } = await prisma.cart.deleteMany({ where: { expiresAt: { lt: cutoff } } });
        logger.info({ count }, 'expired carts removed');
        return;
      }

      case 'otps': {
        // Consumed or expired codes are credentials with no purpose left.
        const { count } = await prisma.otpCode.deleteMany({
          where: { OR: [{ expiresAt: { lt: now } }, { consumedAt: { not: null } }] },
        });
        logger.info({ count }, 'spent otp codes removed');
        return;
      }

      case 'sessions': {
        const { count } = await prisma.session.deleteMany({
          where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { not: null } }] },
        });
        logger.info({ count }, 'dead sessions removed');
        return;
      }

      case 'locations': {
        const cutoff = new Date(now.getTime() - LOCATION_RETENTION_DAYS * 86400 * 1000);
        const count = await container.services.tracking.pruneOlderThan(cutoff);
        logger.info({ count, cutoff }, 'old courier locations pruned');
        return;
      }

      default:
        logger.warn({ payload }, 'unknown cleanup target');
    }
  };
}
