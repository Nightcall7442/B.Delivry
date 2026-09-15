/**
 * Support HTTP controller — thin: validate → call service → map response.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { body, params, query } from '../../../middleware/validation.middleware.js';
import type { SupportService } from '../service/support.service.js';
import type {
  CreateTicketInput,
  TicketListFilters,
  TicketPriority,
  TicketStatus,
} from '../types/index.js';

export class SupportController extends BaseController {
  constructor(private readonly service: SupportService) {
    super();
  }

  list = async (request: FastifyRequest, reply: FastifyReply) =>
    this.paginated(reply, await this.service.list(query<TicketListFilters>(request)));

  get = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, await this.service.get(id));
  };

  create = async (request: FastifyRequest, reply: FastifyReply) =>
    this.created(reply, await this.service.create(body<CreateTicketInput>(request)));

  reply = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const input = body<{ body: string; attachmentUrls?: string[] }>(request);
    return this.created(reply, await this.service.reply(id, input.body, input.attachmentUrls));
  };

  claim = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, await this.service.claim(id));
  };

  assign = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const { assigneeId } = body<{ assigneeId: string | null }>(request);
    return this.ok(reply, await this.service.assign(id, assigneeId));
  };

  setStatus = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const { status } = body<{ status: TicketStatus }>(request);
    return this.ok(reply, await this.service.setStatus(id, status));
  };

  setPriority = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const { priority } = body<{ priority: TicketPriority }>(request);
    return this.ok(reply, await this.service.setPriority(id, priority));
  };

  openCount = async (_request: FastifyRequest, reply: FastifyReply) =>
    this.ok(reply, { count: await this.service.openCount() });
}
