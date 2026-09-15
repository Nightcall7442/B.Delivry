/**
 * Customers module-internal types & DTOs.
 */
export interface CustomerListFilters {
  search?: string | undefined;
  cityId?: string | undefined;
  blocked?: boolean | undefined;
  minOrders?: number | undefined;
  /** Companies: applied (pending) or approved. */
  business?: 'pending' | 'approved' | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface UpdateCustomerInput {
  firstName?: string | undefined;
  lastName?: string | undefined;
  email?: string | null | undefined;
  defaultAddressId?: string | null | undefined;
  marketingOptIn?: boolean | undefined;
}
