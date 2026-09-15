/**
 * Prisma rows → the DTOs in @bazar/types.
 *
 * Rows leak storage details the contract does not have: Decimal columns
 * serialise as strings, money is a bare int next to a currency column,
 * coordinates are two columns instead of a point. Every controller that
 * answers a public shape goes through here, so the clients only ever see what
 * `@bazar/types` promises.
 */
import type {
  Address,
  ChatMessage,
  Courier,
  Delivery,
  Order,
  OrderItem,
  OrderStatusHistory,
  Payment,
  Prisma,
  Product,
  ProductImage,
  Store,
  StoreSchedule,
  Tenant,
  User,
} from '@prisma/client';
import type { Currency } from '@bazar/constants';
import type {
  AddressDto,
  CartSubscriptionDto,
  ChatMessageDto,
  CourierDto,
  CourierShiftDto,
  CurrentUserDto,
  DeliveryDto,
  HaggleDto,
  ImageDto,
  LatLngDto,
  MoneyDto,
  OrderDto,
  OrderItemDto,
  OrderStatusHistoryDto,
  PaymentDto,
  ProductDto,
  PublicTenantDto,
  StoreDto,
  StoreScheduleDto,
  TenantBrandingDto,
  TenantDto,
  Translated,
  UserDto,
} from '@bazar/types';
import type { HaggleRow } from '../../modules/haggle/index.js';
import type { SubscriptionWithNames } from '../../modules/subscriptions/index.js';

type Decimalish = Prisma.Decimal | number | string | null | undefined;

export const decimal = (value: Decimalish): number | null =>
  value === null || value === undefined ? null : Number(value);

export const money = (amount: number, currency: string): MoneyDto => ({
  amount,
  currency: currency as Currency,
});

export const point = (lat: Decimalish, lng: Decimalish): LatLngDto | null => {
  const a = decimal(lat);
  const b = decimal(lng);
  return a === null || b === null ? null : { lat: a, lng: b };
};

const iso = (value: Date): string => value.toISOString();
const translated = (value: Prisma.JsonValue): Translated => (value ?? {}) as Translated;

export function toScheduleDto(row: StoreSchedule): StoreScheduleDto {
  return {
    id: row.id,
    weekday: row.weekday,
    opensAt: row.opensAt,
    closesAt: row.closesAt,
    closed: row.closed,
    // Schedule rows carry no timestamps of their own; the store's stand in.
    createdAt: '',
    updatedAt: '',
  };
}

export function toStoreDto(row: Store & { schedule: StoreSchedule[] }, isOpen: boolean): StoreDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    vendorId: row.vendorId,
    type: row.type,
    status: row.status,
    name: translated(row.name),
    description: row.description === null ? null : translated(row.description),
    slug: row.slug,
    logoUrl: row.logoUrl,
    coverUrl: row.coverUrl,
    counterPhotoUrl: row.counterPhotoUrl,
    promotedUntil: row.promotedUntil === null ? null : iso(row.promotedUntil),
    tags: row.tags as StoreDto['tags'],
    counterPhotoAt: row.counterPhotoAt === null ? null : iso(row.counterPhotoAt),
    phone: row.phone,
    cityId: row.cityId,
    address: row.address,
    point: point(row.lat, row.lng),
    standNumber: row.standNumber,
    ownerName: row.ownerName,
    ownerSince: row.ownerSince,
    ownerPhotoUrl: row.ownerPhotoUrl,
    ownerMotto: row.ownerMotto === null ? null : translated(row.ownerMotto),
    rating: row.rating,
    reviewCount: row.reviewCount,
    preparationMinutes: row.preparationMinutes,
    schedule: row.schedule.map((entry) => ({
      ...toScheduleDto(entry),
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    })),
    isOpen,
  };
}

export function toImageDto(row: ProductImage): ImageDto {
  return {
    url: row.url,
    ...(row.width === null ? {} : { width: row.width }),
    ...(row.height === null ? {} : { height: row.height }),
    ...(row.alt === null ? {} : { alt: row.alt }),
  };
}

export function toProductDto(row: Product & { images: ProductImage[] }): ProductDto {
  return {
    arrivedAt: row.arrivedAt === null ? null : iso(row.arrivedAt),
    tags: row.tags as ProductDto['tags'],
    id: row.id,
    tenantId: row.tenantId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    storeId: row.storeId,
    categoryId: row.categoryId,
    name: translated(row.name),
    description: row.description === null ? null : translated(row.description),
    slug: row.slug,
    unit: row.unit,
    price: money(row.price, row.currency),
    oldPrice: row.oldPrice === null ? null : money(row.oldPrice, row.currency),
    minQuantity: decimal(row.minQuantity) ?? 1,
    quantityStep: decimal(row.quantityStep) ?? 1,
    weightGrams: row.weightGrams,
    images: [...row.images].sort((a, b) => a.sortOrder - b.sortOrder).map(toImageDto),
    available: row.available,
    stock: decimal(row.stock),
    rating: row.rating,
    reviewCount: row.reviewCount,
  };
}

export function toAddressDto(row: Address): AddressDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    customerId: row.customerId,
    label: row.label,
    title: row.title,
    cityId: row.cityId,
    districtId: row.districtId,
    mahallaId: row.mahallaId,
    street: row.street,
    house: row.house,
    apartment: row.apartment,
    entrance: row.entrance,
    floor: row.floor,
    intercom: row.intercom,
    landmark: row.landmark,
    instructions: row.instructions,
    point: point(row.lat, row.lng),
    isDefault: row.isDefault,
  };
}

export function toOrderItemDto(row: OrderItem): OrderItemDto {
  return {
    id: row.id,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.createdAt),
    productId: row.productId,
    name: translated(row.name),
    unit: row.unit,
    quantity: decimal(row.quantity) ?? 0,
    unitPrice: money(row.unitPrice, row.currency),
    total: money(row.total, row.currency),
    comment: row.comment,
    actualQuantity: decimal(row.actualQuantity),
    actualTotal: row.actualTotal === null ? null : money(row.actualTotal, row.currency),
    weighingPhotoUrl: row.weighingPhotoUrl,
  };
}

export function toStatusHistoryDto(row: OrderStatusHistory): OrderStatusHistoryDto {
  return { status: row.status, at: iso(row.at), actorId: row.actorId, comment: row.comment };
}

/** The relations the order screens read; the repository's include supplies exactly these. */
export type OrderRow = Order & {
  items: OrderItem[];
  statusHistory: OrderStatusHistory[];
  delivery?: Pick<Delivery, 'id' | 'status' | 'courierId' | 'etaAt'> | null;
  customer?: {
    id: string;
    userId: string;
    user: { firstName: string | null; phone: string };
  } | null;
  store: Pick<
    Store,
    | 'id'
    | 'vendorId'
    | 'name'
    | 'type'
    | 'status'
    | 'rating'
    | 'logoUrl'
    | 'phone'
    | 'standNumber'
    | 'address'
    | 'lat'
    | 'lng'
  >;
};

export function toOrderDto(row: OrderRow): OrderDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    number: row.number,
    status: row.status,
    customerId: row.customerId,
    storeId: row.storeId,
    store: {
      id: row.store.id,
      name: translated(row.store.name),
      type: row.store.type,
      logoUrl: row.store.logoUrl,
      rating: row.store.rating,
      // Whether the stall is open right now is a catalogue question; on an order it only says "still trading".
      isOpen: row.store.status === 'ACTIVE',
      point: point(row.store.lat, row.store.lng),
    },
    courierId: row.courierId,
    items: row.items.map(toOrderItemDto),
    totals: {
      subtotal: money(row.subtotal, row.currency),
      deliveryFee: money(row.deliveryFee, row.currency),
      serviceFee: money(row.serviceFee, row.currency),
      discount: money(row.discount, row.currency),
      total: money(row.total, row.currency),
    },
    address: {
      cityId: row.addressCityId,
      formatted: row.addressFormatted,
      street: row.addressStreet,
      house: row.addressHouse,
      apartment: row.addressApartment,
      entrance: row.addressEntrance,
      floor: row.addressFloor,
      landmark: row.addressLandmark,
      instructions: row.addressInstructions,
      point: point(row.addressLat, row.addressLng),
    },
    paymentMethod: row.paymentMethod,
    paymentStatus: row.paymentStatus,
    comment: row.comment,
    vendorComment: row.vendorComment,
    substitutionPolicy: row.substitutionPolicy,
    recipientName: row.recipientName,
    recipientPhone: row.recipientPhone,
    groupId: row.groupId,
    dueAt: row.dueAt === null ? null : iso(row.dueAt),
    scheduledFor: row.scheduledFor === null ? null : iso(row.scheduledFor),
    promisedAt: row.promisedAt === null ? null : iso(row.promisedAt),
    etaAt: row.etaAt === null ? null : iso(row.etaAt),
    placedAt: iso(row.placedAt),
    deliveredAt: row.deliveredAt === null ? null : iso(row.deliveredAt),
    cancelledAt: row.cancelledAt === null ? null : iso(row.cancelledAt),
    cancelReason: row.cancelReason,
    customer: row.customer
      ? {
          id: row.customer.id,
          firstName: row.customer.user.firstName,
          phone: row.customer.user.phone,
        }
      : null,
    delivery: row.delivery
      ? {
          id: row.delivery.id,
          status: row.delivery.status,
          courierId: row.delivery.courierId,
          etaAt: row.delivery.etaAt === null ? null : iso(row.delivery.etaAt),
        }
      : null,
    statusHistory: row.statusHistory.map(toStatusHistoryDto),
  };
}

/** The courier's trip. The courier profile is a tracking concern, not sent here. */
export function toDeliveryDto(row: Delivery): DeliveryDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    orderId: row.orderId,
    courierId: row.courierId,
    courier: null,
    status: row.status,
    pickupPoint: point(row.pickupLat, row.pickupLng),
    pickupAddress: row.pickupAddress,
    dropoffPoint: point(row.dropoffLat, row.dropoffLng),
    dropoffAddress: row.dropoffAddress,
    distanceMeters: row.distanceMeters,
    payout: money(row.payout, row.currency),
    assignedAt: row.assignedAt === null ? null : iso(row.assignedAt),
    pickedUpAt: row.pickedUpAt === null ? null : iso(row.pickedUpAt),
    deliveredAt: row.deliveredAt === null ? null : iso(row.deliveredAt),
    etaAt: row.etaAt === null ? null : iso(row.etaAt),
    proofType: row.proofType,
    proofUrl: row.proofUrl,
    handoverCode: row.handoverCode,
    failureReason: row.failureReason,
    attemptCount: row.attemptCount,
  };
}

type CourierRow = Courier & {
  user: {
    firstName: string | null;
    lastName: string | null;
    phone: string;
    avatarUrl: string | null;
  };
};

/** The courier's own profile (or an operator's view of it). */
export function toCourierDto(row: CourierRow, activeOrderCount = 0): CourierDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    userId: row.userId,
    firstName: row.user.firstName ?? '',
    lastName: row.user.lastName ?? '',
    phone: row.user.phone,
    avatarUrl: row.user.avatarUrl,
    status: row.status,
    vehicleType: row.vehicleType,
    plateNumber: row.plateNumber,
    cityId: row.cityId,
    rating: row.rating,
    ratingCount: row.ratingCount,
    completedOrders: row.completedOrders,
    cancelledOrders: row.cancelledOrders,
    balance: money(row.balance, row.currency),
    maxConcurrentOrders: row.maxConcurrentOrders,
    activeOrderCount,
    lastLocation: point(row.lastLat, row.lastLng),
    lastLocationAt: row.lastLocationAt === null ? null : iso(row.lastLocationAt),
    verifiedAt: row.verifiedAt === null ? null : iso(row.verifiedAt),
    neighbour: row.neighbour,
  };
}

export function toCourierShiftDto(shift: {
  status: CourierDto['status'];
  since: Date;
  todayOrders: number;
  todayEarnings: number;
  currency: string;
}): CourierShiftDto {
  return {
    status: shift.status,
    since: iso(shift.since),
    // ponytail: minutes since the last status change, not a shift ledger.
    todayMinutes: Math.max(0, Math.round((Date.now() - shift.since.getTime()) / 60_000)),
    todayOrders: shift.todayOrders,
    todayEarnings: money(shift.todayEarnings, shift.currency),
  };
}

type UserRow = User & {
  roles: { role: string }[];
  customer?: { id: string; plusUntil?: Date | null; referralCode?: string | null } | null;
  courier?: { id: string } | null;
  vendor?: { id: string } | null;
};

export function toUserDto(row: UserRow): UserDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    phone: row.phone,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    avatarUrl: row.avatarUrl,
    locale: row.locale as UserDto['locale'],
    status: row.status,
    roles: row.roles.map((entry) => entry.role as UserDto['roles'][number]),
    phoneVerifiedAt: row.phoneVerifiedAt === null ? null : iso(row.phoneVerifiedAt),
    lastLoginAt: row.lastLoginAt === null ? null : iso(row.lastLoginAt),
  };
}

/** /users/me: the profile plus the ids and permissions a client gates itself with. */
export function toCurrentUserDto(row: UserRow & { permissions: string[] }): CurrentUserDto {
  return {
    ...toUserDto(row),
    permissions: row.permissions as CurrentUserDto['permissions'],
    customerId: row.customer?.id ?? null,
    courierId: row.courier?.id ?? null,
    vendorId: row.vendor?.id ?? null,
    telegramLinked: row.telegramChatId !== null,
    plusUntil:
      row.customer?.plusUntil === undefined || row.customer.plusUntil === null
        ? null
        : iso(row.customer.plusUntil),
    referralCode: row.customer?.referralCode ?? null,
  };
}

// ---------------------------------------------------------------- tenant

const brandingOf = (raw: unknown): TenantBrandingDto | null => {
  if (raw === null || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  return {
    appName: typeof b.appName === 'string' ? b.appName : 'bazar',
    city: typeof b.city === 'string' ? b.city : null,
    logoUrl: typeof b.logoUrl === 'string' ? b.logoUrl : null,
    primary: typeof b.primary === 'string' ? b.primary : null,
    accent: typeof b.accent === 'string' ? b.accent : null,
  };
};

export function toTenantDto(row: Tenant): TenantDto {
  return {
    id: row.id,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    slug: row.slug,
    name: row.name,
    domain: row.domain,
    defaultLocale: row.defaultLocale as TenantDto['defaultLocale'],
    supportedLocales: row.supportedLocales as TenantDto['supportedLocales'],
    currency: row.currency as TenantDto['currency'],
    timezone: row.timezone,
    supportPhone: row.supportPhone,
    active: row.active,
    branding: brandingOf(row.branding),
  };
}

export function toPublicTenantDto(row: Tenant): PublicTenantDto {
  return {
    slug: row.slug,
    name: row.name,
    defaultLocale: row.defaultLocale as PublicTenantDto['defaultLocale'],
    supportPhone: row.supportPhone,
    branding: brandingOf(row.branding),
  };
}

// ---------------------------------------------------------------- subscriptions

export function toSubscriptionDto(row: SubscriptionWithNames): CartSubscriptionDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    customerId: row.customerId,
    storeId: row.storeId,
    storeName: row.storeName,
    addressId: row.addressId,
    addressText: row.addressText,
    paymentMethod: row.paymentMethod,
    items: row.items as unknown as CartSubscriptionDto['items'],
    weekday: row.weekday,
    hour: row.hour,
    active: row.active,
    nextRunAt: iso(row.nextRunAt),
    lastRunAt: row.lastRunAt === null ? null : iso(row.lastRunAt),
    lastOrderId: row.lastOrderId,
    lastError: row.lastError,
  };
}

// ---------------------------------------------------------------- payments

export function toPaymentDto(row: Payment): PaymentDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    orderId: row.orderId,
    purpose: row.purpose,
    subject: row.subject,
    customerId: row.customerId,
    method: row.method,
    provider: row.provider as PaymentDto['provider'],
    status: row.status,
    amount: money(row.amount, row.currency),
    refundedAmount: money(row.refundedAmount, row.currency),
    externalId: row.externalId,
    confirmationUrl: row.confirmationUrl,
    paidAt: row.paidAt === null ? null : iso(row.paidAt),
    failureReason: row.failureReason,
  };
}

export function toChatMessageDto(row: ChatMessage): ChatMessageDto {
  return {
    id: row.id,
    orderId: row.orderId,
    senderUserId: row.senderUserId,
    senderRole: row.senderRole as ChatMessageDto['senderRole'],
    text: row.text,
    createdAt: iso(row.createdAt),
  };
}

// ---------------------------------------------------------------- haggle

export function toHaggleDto(row: HaggleRow): HaggleDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    customerId: row.customerId,
    storeId: row.storeId,
    productId: row.productId,
    productName: row.product.name as HaggleDto['productName'],
    listPrice: money(row.product.price, row.product.currency),
    askedPrice: money(row.askedPrice, row.product.currency),
    offeredPrice: row.offeredPrice === null ? null : money(row.offeredPrice, row.product.currency),
    status: row.status,
    message: row.message,
    reply: row.reply,
    expiresAt: iso(row.expiresAt),
  };
}
