/**
 * Audit HTTP controller — thin: validate → call service → map response.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { params, query } from '../../../middleware/validation.middleware.js';
import type { AuditService } from '../service/audit.service.js';
import type { AuditListQuery } from '../schemas/index.js';

export class AuditController extends BaseController {
  constructor(private readonly service: AuditService) {
    super();
  }

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const { from, to, ...rest } = query<AuditListQuery>(request);

    const result = await this.service.list({
      ...rest,
      ...(from !== undefined ? { from: new Date(from) } : {}),
      ...(to !== undefined ? { to: new Date(to) } : {}),
    });
    return this.paginated(reply, result);
  };

  trail = async (request: FastifyRequest, reply: FastifyReply) => {
    const { entity, entityId } = params<{ entity: string; entityId: string }>(request);
    return this.ok(reply, await this.service.trail(entity, entityId));
  };
}
