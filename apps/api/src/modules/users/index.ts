/**
 * Users module public API. Other modules import ONLY from here (service + types), never from repository.
 */
export { UsersService } from './service/users.service.js';
export { UsersRepository } from './repository/users.repository.js';
export { UsersController } from './controller/users.controller.js';
export { usersRoutes } from './routes/users.routes.js';
export type { UserWithProfiles } from './repository/users.repository.js';
export type { CreateStaffInput, UpdateProfileInput, UserListFilters } from './types/index.js';
