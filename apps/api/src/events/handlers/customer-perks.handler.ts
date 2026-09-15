/**
 * The platform's own products, delivered by events, so a Payme webhook, a
 * balance payment and a courier's "Доставил" all end in the same place:
 *   payment.captured (PLUS)  → Plus turns on
 *   delivery.delivered       → cashback lands; a referred newcomer's first
 *                              order pays both sides their bonus
 *   order PICKED_UP          → an order paid "from balance" is charged now,
 *                              after weighing, when the total is final
 */
import {
  CASHBACK,
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_PURPOSE,
  PLUS,
  PROMOTION,
  REFERRAL_BONUS_MINOR,
  type Currency,
} from '@bazar/constants';
import { TEMPLATE } from '@bazar/notifications';
import { money } from '@bazar/payments';
import { systemContext } from '../../common/types/request-context.js';
import { runWithContext } from '../../common/tenant/tenant-context.js';
import type { JobQueue } from '../../infrastructure/redis/queue.js';
import { JOB, QUEUE, type SendNotificationJob } from '../../jobs/queues.js';
import type { CouriersService } from '../../modules/couriers/service/couriers.service.js';
import type { CustomersService } from '../../modules/customers/service/customers.service.js';
import { DELIVERY_EVENT } from '../../modules/delivery/domain/delivery.events.js';
import { ORDER_EVENT } from '../../modules/orders/domain/order.events.js';
import type { OrdersService } from '../../modules/orders/service/orders.service.js';
import { PAYMENT_EVENT } from '../../modules/payments/domain/payment.events.js';
import type { PaymentsService } from '../../modules/payments/service/payments.service.js';
import type { StoresService } from '../../modules/stores/service/stores.service.js';
import type { EventBus } from '../event-bus.js';

export interface PerksDeps {
  customers: CustomersService;
  couriers: CouriersService;
  orders: OrdersService;
  payments: PaymentsService;
  stores: StoresService;
  queue: JobQueue;
}

const sum = (minor: number) => `${(minor / 100).toLocaleString('ru-RU')} сум`;

export function registerCustomerPerksHandlers(events: EventBus, deps: PerksDeps): void {
  const tell = (job: SendNotificationJob) =>
    deps.queue.enqueue(QUEUE.NOTIFICATIONS, JOB.SEND_NOTIFICATION, job, {
      ...(job.idempotencyKey !== undefined ? { jobId: job.idempotencyKey } : {}),
    });

  // ---------------------------------------------------------------- Promotion
  events.on(PAYMENT_EVENT.CAPTURED, async (event) => {
    if (event.payload.purpose !== PAYMENT_PURPOSE.PROMO) return;
    const storeId = event.payload.subject.split(':')[1];
    if (storeId === undefined) return;
    await runWithContext(systemContext(event.tenantId, `promo:${event.id}`, 'uz'), () =>
      deps.stores.promote(storeId, PROMOTION.DAYS),
    );
  });

  // ---------------------------------------------------------------- Plus
  events.on(PAYMENT_EVENT.CAPTURED, async (event) => {
    if (event.payload.purpose !== PAYMENT_PURPOSE.PLUS) return;
    const until = await runWithContext(
      systemContext(event.tenantId, `plus:${event.id}`, 'uz'),
      () => deps.customers.activatePlus(event.payload.customerId, PLUS.DAYS),
    );
    await tell({
      tenantId: event.tenantId,
      userId: event.payload.customerId,
      template: TEMPLATE.PROMO,
      params: {
        title: 'Bazar Plus',
        body: `Активен до ${until.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}: доставка бесплатно, курьер — первым.`,
      },
      deepLink: '/plus',
      idempotencyKey: `notify:plus:${event.payload.paymentId}`,
    });
  });

  // ---------------------------------------------------------------- tips
  events.on(PAYMENT_EVENT.CAPTURED, async (event) => {
    if (event.payload.purpose !== PAYMENT_PURPOSE.TIP || event.payload.orderId === null) return;
    const { orderId } = event.payload;
    await runWithContext(systemContext(event.tenantId, `tip:${event.id}`, 'uz'), async () => {
      const order = await deps.orders.get(orderId);
      if (order.courierId === null) return;
      const courier = await deps.couriers.get(order.courierId);
      await deps.payments.creditWallet({
        userId: courier.userId,
        type: 'TIP',
        amount: money(event.payload.amount, event.payload.currency as Currency),
        orderId,
        comment: `tip:${orderId}`,
      });
      await tell({
        tenantId: event.tenantId,
        userId: courier.userId,
        template: TEMPLATE.PROMO,
        params: {
          title: `Чаевые +${sum(event.payload.amount)}`,
          body: `Клиент поблагодарил за заказ ${order.number}. Уже на балансе.`,
        },
        idempotencyKey: `notify:tip:${event.payload.paymentId}`,
      });
    });
  });

  // ---------------------------------------------------------------- cashback + referral
  events.on(DELIVERY_EVENT.DELIVERED, async (event) => {
    await runWithContext(systemContext(event.tenantId, `perks:${event.id}`, 'uz'), async () => {
      const order = await deps.orders.get(event.payload.orderId);
      const customer = order.customer;
      if (customer === null || customer === undefined) return;
      const currency = order.currency as Currency;

      const cashback = Math.floor((order.subtotal * CASHBACK.PERCENT) / 100);
      if (cashback > 0) {
        await deps.payments.creditWallet({
          userId: customer.userId,
          type: 'CASHBACK',
          amount: money(cashback, currency),
          orderId: order.id,
          comment: `cashback:${order.id}`,
        });
        await tell({
          tenantId: event.tenantId,
          userId: order.customerId,
          template: TEMPLATE.PROMO,
          params: {
            title: `Кешбэк ${sum(cashback)}`,
            body: `${CASHBACK.PERCENT} % за заказ ${order.number} — на балансе, действует ${CASHBACK.EXPIRES_DAYS} дней.`,
          },
          deepLink: '/plus',
          idempotencyKey: `notify:cashback:${order.id}`,
        });
      }

      // The newcomer's first delivered order: both sides get the bonus, once.
      const referral = await deps.customers.claimReferralReward(order.customerId);
      if (referral === null) return;
      for (const side of [referral.referred, referral.referrer]) {
        await deps.payments.creditWallet({
          userId: side.userId,
          type: 'REFERRAL',
          amount: money(REFERRAL_BONUS_MINOR, currency),
          orderId: order.id,
          comment: `referral:${referral.referred.customerId}`,
        });
        await tell({
          tenantId: event.tenantId,
          userId: side.customerId,
          template: TEMPLATE.PROMO,
          params: {
            title: `+${sum(REFERRAL_BONUS_MINOR)} за приглашение`,
            body:
              side === referral.referred
                ? 'Первый заказ доставлен — бонус от друга уже на балансе.'
                : `Друг сделал первый заказ — ${sum(REFERRAL_BONUS_MINOR)} на балансе.`,
          },
          deepLink: '/invite',
          idempotencyKey: `notify:referral:${referral.referred.customerId}:${side.customerId}`,
        });
      }
    });
  });

  // ---------------------------------------------------------------- pay from balance
  events.on(ORDER_EVENT.STATUS_CHANGED, async (event) => {
    if (event.payload.to !== ORDER_STATUS.PICKED_UP) return;
    await runWithContext(systemContext(event.tenantId, `balance:${event.id}`, 'uz'), async () => {
      const order = await deps.orders.get(event.payload.orderId);
      if (order.paymentMethod !== PAYMENT_METHOD.BALANCE) return;
      // A short balance leaves the payment FAILED; the order screen then offers Payme/Click.
      await deps.payments
        .create({ orderId: order.id, method: PAYMENT_METHOD.BALANCE })
        .catch(() => undefined);
    });
  });
}
