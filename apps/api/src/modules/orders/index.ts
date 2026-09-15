/**
 * Orders module public API. Other modules import ONLY from here (service + types), never from repository.
 */
export { OrdersService } from './service/orders.service.js';
export { OrdersRepository } from './repository/orders.repository.js';
export { OrdersController } from './controller/orders.controller.js';
export { ordersRoutes } from './routes/orders.routes.js';
export {
  assertTransition,
  canTransition,
  canActorTransition,
  isTerminal,
  nextCourierStatus,
  ORDER_TRANSITIONS,
  COURIER_ACTION_STATUS,
} from './domain/order-state-machine.js';
export { ORDER_EVENT } from './domain/order.events.js';
export type { OrderEventPayloads } from './domain/order.events.js';
export type { OrderWithRelations } from './repository/orders.repository.js';
export type { CreateOrderInput, OrderListFilters, OrderTotals } from './types/index.js';
