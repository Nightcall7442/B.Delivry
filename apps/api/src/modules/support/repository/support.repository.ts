/**
 * Support persistence (Prisma). Tenant-scoped.
 */
import type { Prisma, SupportMessage, SupportTicket } from '@prisma/client';
import { BaseRepository } from '../../../common/base/base.repository.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type { CreateTicketInput, TicketListFilters, TicketStatus } from '../types/index.js';

const TICKET_INCLUDE = {
  messages: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.SupportTicketInclude;

export type TicketWithMessages = SupportTicket & { messages: SupportMessage[] };

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
        where: { id: ticketId },
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
    return this.prisma.supportTicket.update({ where: { id }, data });
  }

  async setStatus(id: string, status: TicketStatus): Promise<SupportTicket> {
    return this.prisma.supportTicket.update({
      where: { id },
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
