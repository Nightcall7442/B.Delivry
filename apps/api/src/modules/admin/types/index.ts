/**
 * Admin module-internal types & DTOs.
 */
export interface TenantSettings {
  tenantId: string;
  /** Kill switch: stop taking orders platform-wide without a deploy. */
  ordersEnabled: boolean;
  autoConfirmOrders: boolean;
  autoAssignCouriers: boolean;
  defaultTariffId: string | null;
  minAppVersion: string | null;
  maintenanceMessage: string | null;
}

/** A PATCH body: any subset, where absent and undefined both mean "leave it". */
export type UpdateSettingsInput = {
  [K in keyof Omit<TenantSettings, 'tenantId'>]?: TenantSettings[K] | undefined;
};

/** The operator wall: everything that needs a human right now. */
export interface MonitoringSnapshot {
  ordersActive: number;
  ordersSearchingCourier: number;
  ordersStuck: number;
  couriersOnline: number;
  openTickets: number;
  failedPaymentsToday: number;
}
