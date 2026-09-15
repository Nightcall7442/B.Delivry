/**
 * Support business logic. Tickets, threads, assignment, escalation.
 */
import { PERMISSION, isStaffRole } from '@bazar/constants';
import { TEMPLATE } from '@bazar/notifications';
import { randomCode } from '@bazar/utils';
import type { SupportMessage, SupportTicket } from '@prisma/client';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../common/errors/domain.errors.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type { NotificationSender } from '../../notifications/types/index.js';
import type { SupportRepository, TicketWithMessages } from '../repository/support.repository.js';
import type {
  CreateTicketInput,
  TicketListFilters,
  TicketPriority,
  TicketStatus,
} from '../types/index.js';

export interface SupportServiceDeps extends ServiceDeps {
  repository: SupportRepository;
  notifications: NotificationSender;
}

export class SupportService extends BaseService {
  private readonly repository: SupportRepository;
  private readonly notifications: NotificationSender;

  constructor(deps: SupportServiceDeps) {
    super(deps);
    this.repository = deps.repository;
    this.notifications = deps.notifications;
  }

  async create(input: CreateTicketInput): Promise<TicketWithMessages> {
    const user = this.currentUser();
    // Short, readable over the phone, and not guessable in bulk.
    const number = `S-${randomCode(6)}`;
    return this.repository.create(input, user.id, number);
  }

  /**
   * A ticket is visible to its author and to support staff, and to nobody
   * else: threads routinely contain addresses and phone numbers.
   */
  async get(id: string): Promise<TicketWithMessages> {
    const ticket = await this.getOrThrow(id);
    const user = this.currentUser();

    if (ticket.userId !== user.id && !user.roles.some(isStaffRole)) {
      this.authorize(PERMISSION.SUPPORT_HANDLE);
    }

    return ticket;
  }

  async list(filters: TicketListFilters): Promise<PaginatedResult<SupportTicket>> {
    const user = this.currentUser();

    // Without the staff permission a caller sees only their own tickets.
    if (!user.permissions.includes(PERMISSION.SUPPORT_HANDLE)) {
      return this.repository.list({ ...filters, userId: user.id });
    }

    return this.repository.list(filters);
  }

  async reply(id: string, body: string, attachmentUrls: string[] = []): Promise<SupportMessage> {
    const ticket = await this.get(id);

    if (ticket.status === 'CLOSED') {
      throw new ConflictError('This ticket is closed; open a new one');
    }

    const user = this.currentUser();
    const fromStaff =
      user.permissions.includes(PERMISSION.SUPPORT_HANDLE) && ticket.userId !== user.id;

    const message = await this.repository.addMessage(id, user.id, fromStaff, body, attachmentUrls);

    // Only staff replies are worth a push: the customer already knows what
    // they themselves just wrote.
    if (fromStaff) {
      await this.notifications.send({
        tenantId: ticket.tenantId,
        userId: ticket.userId,
        template: TEMPLATE.SUPPORT_REPLY,
        params: { ticketNumber: ticket.number },
        deepLink: `/support/${ticket.id}`,
        idempotencyKey: `support-reply:${message.id}`,
      });
    }

    return message;
  }

  async assign(id: string, assigneeId: string | null): Promise<SupportTicket> {
    this.authorize(PERMISSION.SUPPORT_HANDLE);
    await this.getOrThrow(id);
    return this.repository.update(id, {
      assignee: assigneeId === null ? { disconnect: true } : { connect: { id: assigneeId } },
    });
  }

  /** Operators claim a ticket rather than being handed one. */
  async claim(id: string): Promise<SupportTicket> {
    this.authorize(PERMISSION.SUPPORT_HANDLE);
    const ticket = await this.getOrThrow(id);

    if (ticket.assigneeId !== null && ticket.assigneeId !== this.currentUser().id) {
      throw new ConflictError('This ticket is already assigned to someone else');
    }

    return this.repository.update(id, {
      assignee: { connect: { id: this.currentUser().id } },
      status: 'PENDING',
    });
  }

  async setStatus(id: string, status: TicketStatus): Promise<SupportTicket> {
    const ticket = await this.get(id);
    const user = this.currentUser();

    // The author may close their own ticket; anything else is staff work.
    const ownClose = ticket.userId === user.id && status === 'CLOSED';
    if (!ownClose) this.authorize(PERMISSION.SUPPORT_HANDLE);

    return this.repository.setStatus(id, status);
  }

  async setPriority(id: string, priority: TicketPriority): Promise<SupportTicket> {
    this.authorize(PERMISSION.SUPPORT_HANDLE);
    await this.getOrThrow(id);
    return this.repository.update(id, { priority });
  }

  async openCount(): Promise<number> {
    this.authorize(PERMISSION.SUPPORT_HANDLE);
    return this.repository.countOpen();
  }

  private async getOrThrow(id: string): Promise<TicketWithMessages> {
    const ticket = await this.repository.findById(id);
    if (ticket === null) throw new NotFoundError('Ticket', id);
    return ticket;
  }
}
