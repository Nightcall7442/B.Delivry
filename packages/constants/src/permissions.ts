/**
 * Permission keys (resource:action), grouped per module.
 */
export const PERMISSION = {
  // orders
  ORDER_READ: 'order:read',
  ORDER_READ_ANY: 'order:read_any',
  ORDER_CREATE: 'order:create',
  ORDER_UPDATE: 'order:update',
  ORDER_CANCEL: 'order:cancel',
  ORDER_ASSIGN: 'order:assign',
  // catalog
  PRODUCT_READ: 'product:read',
  PRODUCT_WRITE: 'product:write',
  CATEGORY_WRITE: 'category:write',
  // stores & vendors
  STORE_READ: 'store:read',
  STORE_WRITE: 'store:write',
  VENDOR_READ: 'vendor:read',
  VENDOR_WRITE: 'vendor:write',
  // delivery
  DELIVERY_READ: 'delivery:read',
  DELIVERY_ACCEPT: 'delivery:accept',
  DELIVERY_COMPLETE: 'delivery:complete',
  COURIER_READ: 'courier:read',
  COURIER_WRITE: 'courier:write',
  // money
  PAYMENT_READ: 'payment:read',
  PAYMENT_REFUND: 'payment:refund',
  PRICING_WRITE: 'pricing:write',
  PROMOTION_WRITE: 'promotion:write',
  // people
  CUSTOMER_READ: 'customer:read',
  USER_READ: 'user:read',
  USER_WRITE: 'user:write',
  // platform
  GEO_WRITE: 'geo:write',
  ANALYTICS_READ: 'analytics:read',
  AUDIT_READ: 'audit:read',
  SUPPORT_HANDLE: 'support:handle',
  SETTINGS_WRITE: 'settings:write',
  TENANT_WRITE: 'tenant:write',
} as const;

export type Permission = (typeof PERMISSION)[keyof typeof PERMISSION];

export const ALL_PERMISSIONS = Object.values(PERMISSION);
