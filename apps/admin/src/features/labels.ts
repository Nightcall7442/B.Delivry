/**
 * Operational wording. The customer apps say "Принимаем заказ"; the desk says
 * what the row is waiting for.
 */
import type { OrderStatus } from '@bazar/constants';
import type { CourierStatus, DeliveryStatus } from '@bazar/constants';

export const ORDER_LABEL: Record<OrderStatus, { text: string; tone: string }> = {
  PENDING: { text: 'Новый', tone: 'bg-saffron-100 text-saffron-600' },
  CONFIRMED: { text: 'Подтверждён', tone: 'bg-brand-50 text-brand-700' },
  SEARCHING_COURIER: { text: 'Ищем курьера', tone: 'bg-saffron-100 text-saffron-600' },
  COURIER_ASSIGNED: { text: 'Курьер назначен', tone: 'bg-brand-50 text-brand-700' },
  COURIER_ARRIVED_PICKUP: { text: 'Курьер у продавца', tone: 'bg-brand-50 text-brand-700' },
  PICKING_UP: { text: 'Сборка', tone: 'bg-brand-50 text-brand-700' },
  PICKED_UP: { text: 'Забрал', tone: 'bg-brand-100 text-brand-800' },
  IN_DELIVERY: { text: 'В пути', tone: 'bg-brand-100 text-brand-800' },
  COURIER_ARRIVED: { text: 'У двери', tone: 'bg-brand-100 text-brand-800' },
  DELIVERED: { text: 'Доставлен', tone: 'bg-sand-100 text-ink-muted' },
  CANCELLED: { text: 'Отменён', tone: 'bg-sand-100 text-ink-muted' },
  FAILED: { text: 'Не доставлен', tone: 'bg-danger/10 text-danger' },
  REFUNDED: { text: 'Возврат', tone: 'bg-sand-100 text-ink-muted' },
};

export const COURIER_LABEL: Record<CourierStatus, { text: string; tone: string }> = {
  ONLINE: { text: 'На смене', tone: 'bg-brand-50 text-brand-700' },
  BUSY: { text: 'Везёт', tone: 'bg-brand-100 text-brand-800' },
  OFFLINE: { text: 'Не на смене', tone: 'bg-sand-100 text-ink-muted' },
  SUSPENDED: { text: 'Отстранён', tone: 'bg-danger/10 text-danger' },
};

export const DELIVERY_LABEL: Record<DeliveryStatus, string> = {
  PENDING: 'ждёт',
  SEARCHING: 'поиск курьера',
  ASSIGNED: 'назначен',
  AT_PICKUP: 'у продавца',
  PICKED_UP: 'забрал',
  IN_TRANSIT: 'в пути',
  AT_DROPOFF: 'у двери',
  DELIVERED: 'доставлен',
  FAILED: 'не доставлен',
  CANCELLED: 'отменён',
};

export const VEHICLE_LABEL: Record<string, string> = {
  FOOT: 'пешком',
  BICYCLE: 'велосипед',
  SCOOTER: 'скутер',
  MOTORBIKE: 'мотоцикл',
  CAR: 'авто',
  VAN: 'фургон',
};

export const when = (iso: string): string =>
  new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export const ago = (iso: string | null): string => {
  if (!iso) return 'давно';
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds} с назад`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} мин назад`;
  return `${Math.round(seconds / 3600)} ч назад`;
};
