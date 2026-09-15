/**
 * Auth module public API. Other modules import ONLY from here (service + types), never from repository.
 */
export { AuthService, TokenService } from './service/auth.service.js';
export { AuthRepository } from './repository/auth.repository.js';
export { AuthController } from './controller/auth.controller.js';
export { authRoutes } from './routes/auth.routes.js';
export { hashPassword, verifyPassword } from './guards/index.js';
export type { AuthResult, DeviceInfo, OtpChallenge, UserWithRoles } from './types/index.js';
