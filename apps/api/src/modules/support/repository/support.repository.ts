/**
 * Support persistence (Prisma). Tenant-scoped.
 */
import { STAFF_ROLES } from '@bazar/constants';
import type { Prisma, SupportMessage, SupportTicket } from '@prisma/client';
import { BaseRepository } from '../../../common/base/base.repository.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type { CreateTicketInput, TicketListFilters, TicketStatus } from '../types/index.js';

const TICKET_INCLUDE = {
  messages: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.SupportTicketInclude;

export type TicketWithMessages = SupportTicket & { messages: SupportMessage[] };

/** Who is on the two sides of an order: who a ticket about it may be opened by. */
export interface OrderParties {
  tenantId: string;
  customerId: string;
  courierId: string | null;
  vendorId: string;
}

export class SupportRepository extends BaseRepository {
  /** Ticket and its first message are created together: an empty ticket says nothing. */
  async create(
    input: CreateTicketInput,
    userId: string,
    number: string,
  ): Promise<TicketWithMessages> {
    return this.prisma.supportTicket.create({
      data: {
        tenantId: this.tenantScope().tenantId,
        number,
        userId,
        orderId: input.orderId ?? null,
        topic: input.topic,
        subject: input.subject,
        messages: {
          create: {
            authorId: userId,
            fromStaff: false,
            body: input.body,
            attachmentUrls: input.attachmentUrls ?? [],
          },
        },
      },
      include: TICKET_INCLUDE,
    });
  }

  /** The parties of an order of this tenant, or null: a ticket cannot point at someone else's. */
  async findOrderParties(orderId: string): Promise<OrderParties | null> {
    const order = await this.prisma.order.findFirst({
      where: this.scoped({ id: orderId }),
      select: {
        tenantId: true,
        customerId: true,
        courierId: true,
        store: { select: { vendorId: true } },
      },
    });
    if (order === null) return null;
    return {
      tenantId: order.tenantId,
      customerId: order.customerId,
      courierId: order.courierId,
      vendorId: order.store.vendorId,
    };
  }

  /** A ticket is handed to a member of the desk of this tenant, not to any user id. */
  async isStaffMember(userId: string): Promise<boolean> {
    const count = await this.prisma.user.count({
      where: this.scoped({
        id: userId,
        deletedAt: null,
        roles: { some: { role: { in: [...STAFF_ROLES] } } },
      }),
    });
    return count > 0;
  }

  async findById(id: string): Promise<TicketWithMessages | null> {
    return this.prisma.supportTicket.findFirst({
      where: this.scoped({ id }),
      include: TICKET_INCLUDE,
    });
  }

  async list(filters: TicketListFilters): Promise<PaginatedResult<SupportTicket>> {
    const where: Prisma.SupportTicketWhereInput = {
      ...this.tenantScope(),
      ...(filters.status !== undefined ? { status: filters.status } : {}),
      ...(filters.topic !== undefined ? { topic: filters.topic } : {}),
      ...(filters.assigneeId !== undefined ? { assigneeId: filters.assigneeId } : {}),
      ...(filters.userId !== undefined ? { userId: filters.userId } : {}),
      ...(filters.search !== undefined
        ? {
            OR: [
              { number: { contains: filters.search, mode: 'insensitive' as const } },
              { subject: { contains: filters.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    return this.page(
      filters,
      (page) =>
        this.prisma.supportTicket.findMany({
          // Urgent first, then whatever has been waiting longest for a reply.
          where,
          orderBy: [{ priority: 'desc' }, { lastMessageAt: 'asc' }],
          ...page,
        }),
      () => this.prisma.supportTicket.count({ where }),
    );
  }

  async addMessage(
    ticketId: string,
    authorId: string,
    fromStaff: boolean,
    body: string,
    attachmentUrls: string[],
  ): Promise<SupportMessage> {
    const [message] = await this.prisma.$transaction([
      this.prisma.supportMessage.create({
        data: { ticketId, authorId, fromStaff, body, attachmentUrls },
      }),
      this.prisma.supportTicket.update({
        where: { id: ticketId, ...this.tenantScope() },
        data: {
          lastMessageAt: new Date(),
          // A customer reply reopens a ticket that support had parked.
          ...(fromStaff ? { status: 'PENDING' } : { status: 'OPEN' }),
        },
      }),
    ]);

    return message;
  }

  async update(id: string, data: Prisma.SupportTicketUpdateInput): Promise<SupportTicket> {
    return this.prisma.supportTicket.update({ where: { id, ...this.tenantScope() }, data });
  }

  /**
   * Takes a ticket nobody holds (or that this agent already holds), in one statement: two agents
   * pressing "take" together cannot both be told they got it.
   */
  async claim(id: string, userId: string): Promise<boolean> {
    const result = await this.prisma.supportTicket.updateMany({
      where: this.scoped({ id, OR: [{ assigneeId: null }, { assigneeId: userId }] }),
      data: { assigneeId: userId, status: 'PENDING' },
    });
    return result.count > 0;
  }

  async setStatus(id: string, status: TicketStatus): Promise<SupportTicket> {
    return this.prisma.supportTicket.update({
      where: { id, ...this.tenantScope() },
      data: {
        status,
        ...(status === 'RESOLVED' ? { resolvedAt: new Date() } : {}),
      },
    });
  }

  async countOpen(): Promise<number> {
    return this.prisma.supportTicket.count({
      where: { ...this.tenantScope(), status: { in: ['OPEN', 'PENDING'] } },
    });
  }
}
