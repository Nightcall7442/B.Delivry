/**
 * Human labels for enum values, read from the @bazar/i18n catalogue. The
 * `xxxText(locale)` factories are what the customer apps use; the upper-case
 * constants are the Russian tables the admin, courier and bot still read.
 */
import {
  ORDER_STATUS,
  type OrderStatus,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  type PaymentMethod,
  type PaymentStatus,
  PRODUCT_UNIT,
  type ProductUnit,
  STORE_TAG,
  STORE_TYPE,
  type StoreTag,
  type StoreType,
  SUBSTITUTION_POLICY,
  type SubstitutionPolicy,
} from '@bazar/constants';
import { createT, type MessageKey } from '@bazar/i18n';

const table = <K extends string, V>(keys: readonly K[], value: (key: K) => V): Record<K, V> =>
  Object.fromEntries(keys.map((key) => [key, value(key)])) as Record<K, V>;

export const storeTypeLabel = (locale: string): Record<StoreType, string> => {
  const t = createT(locale);
  return table(Object.values(STORE_TYPE), (type) => t(`store.type.${type}` as MessageKey));
};

export const STORE_TYPE_GLYPH: Record<StoreType, string> = {
  BAZAAR_STALL: '🧺',
  SHOP: '🏪',
  SUPERMARKET: '🛒',
  LOCAL_POINT: '📦',
  ENTREPRENEUR: '🧑‍🌾',
  RESTAURANT: '🍽️',
  DARK_STORE: '🏬',
  WAREHOUSE: '🏭',
};

/** Headline + one line under it, the way the GO sheet talks. */
export const orderStatusText = (
  locale: string,
): Record<OrderStatus, { title: string; hint: string }> => {
  const t = createT(locale);
  return table(Object.values(ORDER_STATUS), (status) => ({
    title: t(`status.${status}.title` as MessageKey),
    hint: t(`status.${status}.hint` as MessageKey),
  }));
};

/** Steps of the progress bar on the tracking sheet, in order. */
export const orderSteps = (
  locale: string,
): ReadonlyArray<{ label: string; statuses: readonly OrderStatus[] }> => {
  const t = createT(locale);
  return [
    { label: t('steps.accepted'), statuses: ['PENDING', 'CONFIRMED'] },
    { label: t('steps.courier'), statuses: ['SEARCHING_COURIER', 'COURIER_ASSIGNED'] },
    { label: t('steps.picking'), statuses: ['COURIER_ARRIVED_PICKUP', 'PICKING_UP', 'PICKED_UP'] },
    { label: t('steps.onWay'), statuses: ['IN_DELIVERY', 'COURIER_ARRIVED'] },
    { label: t('steps.delivered'), statuses: ['DELIVERED'] },
  ];
};

export const paymentMethodText = (
  locale: string,
): Record<PaymentMethod, { title: string; hint: string }> => {
  const t = createT(locale);
  return table(Object.values(PAYMENT_METHOD), (method) => ({
    title: t(`payment.${method}.title` as MessageKey),
    hint: t(`payment.${method}.hint` as MessageKey),
  }));
};

/** What the courier does when something is out — in the customer's words and in the courier's. */
export const substitutionText = (
  locale: string,
): Record<SubstitutionPolicy, { title: string; hint: string; courier: string }> => {
  const t = createT(locale);
  return table(Object.values(SUBSTITUTION_POLICY), (policy) => ({
    title: t(`substitution.${policy}.title` as MessageKey),
    hint: t(`substitution.${policy}.hint` as MessageKey),
    courier: t(`substitution.${policy}.courier` as MessageKey),
  }));
};

export const paymentStatusText = (locale: string): Record<PaymentStatus, string> => {
  const t = createT(locale);
  return table(Object.values(PAYMENT_STATUS), (status) =>
    t(`paymentStatus.${status}` as MessageKey),
  );
};

/** Badges a vendor puts on a stall or a product: eco, halal, homemade, gift. */
export const tagLabel = (locale: string): Record<StoreTag, string> => {
  const t = createT(locale);
  return table(Object.values(STORE_TAG), (tag) => t(`tag.${tag}` as MessageKey));
};

export const unitLabel = (locale: string): Record<ProductUnit, string> => {
  const t = createT(locale);
  return table(Object.values(PRODUCT_UNIT), (unit) => t(`unit.${unit}` as MessageKey));
};

/** Online providers the customer can pick from; the API's default covers the rest. */
export const ONLINE_PROVIDERS = [
  { id: 'payme', title: 'Payme' },
  { id: 'click', title: 'Click' },
] as const;
export type OnlineProvider = (typeof ONLINE_PROVIDERS)[number]['id'];

// Russian tables for the staff apps, which speak one language.
export const STORE_TYPE_LABEL = storeTypeLabel('ru');
export const ORDER_STATUS_TEXT = orderStatusText('ru');
export const ORDER_STEPS = orderSteps('ru');
export const PAYMENT_METHOD_TEXT = paymentMethodText('ru');
export const SUBSTITUTION_TEXT = substitutionText('ru');
export const PAYMENT_STATUS_TEXT = paymentStatusText('ru');
export const UNIT_LABEL = unitLabel('ru');
