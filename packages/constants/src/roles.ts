/**
 * System roles: CUSTOMER, COURIER, VENDOR, OPERATOR, ADMIN, SUPER_ADMIN (const object + type).
 */
export const ROLE = {
  CUSTOMER: 'CUSTOMER',
  COURIER: 'COURIER',
  VENDOR: 'VENDOR',
  OPERATOR: 'OPERATOR',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];

export const ALL_ROLES = Object.values(ROLE);

/** Staff roles see the admin panel; the rest use the customer/courier/vendor apps. */
export const STAFF_ROLES: readonly Role[] = [ROLE.OPERATOR, ROLE.ADMIN, ROLE.SUPER_ADMIN];

export const isStaffRole = (role: Role): boolean => STAFF_ROLES.includes(role);
