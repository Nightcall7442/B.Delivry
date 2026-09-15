/**
 * Payments HTTP controller — thin: validate → call service → map response.
 */
import { requireContext, runWithContext } from '../../../common/tenant/tenant-context.js';
import { systemContext } from '../../../common/types/request-context.js';
import { timingSafeEqual } from 'node:crypto';
import type { ClickRequest, ClickShopApi } from '../service/click-shop.js';
import { PAYME_ERROR, type PaymeMerchantApi, type RpcRequest } from '../service/payme-merchant.js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { toPaymentDto } from '../../../common/dto/index.js';
import { ForbiddenError } from '../../../common/errors/domain.errors.js';
import { body, params, query } from '../../../middleware/validation.middleware.js';
import type { PaymentsService } from '../service/payments.service.js';
import type { CreatePaymentInput } from '../types/index.js';
import type { PaymentsListQuery } from '../schemas/index.js';

const PAYME_AUTH_MESSAGE = {
  ru: 'Недостаточно привилегий',
  uz: 'Huquq yetarli emas',
  en: 'Insufficient privilege',
};
const PAYME_REQUEST_MESSAGE = {
  ru: 'Неверный запрос',
  uz: "Noto'g'ri so'rov",
  en: 'Invalid request',
};

export class PaymentsController extends BaseController {
  constructor(
    private readonly service: PaymentsService,
    private readonly payme?: PaymeMerchantApi,
    private readonly paymeKey?: string,
    private readonly click?: ClickShopApi,
  ) {
    super();
  }

  create = async (request: FastifyRequest, reply: FastifyReply) =>
    this.created(reply, toPaymentDto(await this.service.create(body<CreatePaymentInput>(request))));

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const { from, to, ...rest } = query<PaymentsListQuery>(request);

    const page = await this.service.list({
      ...rest,
      ...(from !== undefined ? { from: new Date(from) } : {}),
      ...(to !== undefined ? { to: new Date(to) } : {}),
    });
    return this.paginated(reply, { ...page, items: page.items.map(toPaymentDto) });
  };

  get = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, toPaymentDto(await this.service.get(id)));
  };

  refund = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const input = body<{ amount?: { amount: number; currency: string }; reason: string }>(request);
    return this.ok(
      reply,
      await this.service.refund(id, {
        reason: input.reason,
        ...(input.amount !== undefined
          ? { amount: { amount: input.amount.amount, currency: input.amount.currency as 'UZS' } }
          : {}),
      }),
    );
  };

  balance = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    if (user === null || user === undefined) throw new ForbiddenError();
    return this.ok(reply, await this.service.balance(user.id));
  };

  walletHistory = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    if (user === null || user === undefined) throw new ForbiddenError();
    const filters = query<{ page?: number; pageSize?: number }>(request);
    return this.paginated(reply, await this.service.walletHistory(user.id, filters));
  };

  /**
   * Provider callback. Public by necessity: the signature check inside the
   * service is what makes it safe, not the route.
   */
  /**
   * Payme's Merchant API speaks JSON-RPC and expects its own envelope, not
   * ours: the answer goes out as-is, always with HTTP 200.
   */
  paymeRpc = async (request: FastifyRequest, reply: FastifyReply) => {
    const api = this.payme;
    if (api === undefined) return reply.code(404).send({ ok: false });
    if (!this.paymeAuthorized(request)) {
      return reply.send({
        jsonrpc: '2.0',
        id: null,
        error: { code: PAYME_ERROR.INSUFFICIENT_PRIVILEGE, message: PAYME_AUTH_MESSAGE },
      });
    }
    let body: RpcRequest;
    try {
      body = JSON.parse(typeof request.body === 'string' ? request.body : '{}') as RpcRequest;
    } catch {
      return reply.send({
        jsonrpc: '2.0',
        id: null,
        error: { code: PAYME_ERROR.INVALID_REQUEST, message: PAYME_REQUEST_MESSAGE },
      });
    }
    return reply.send(await this.asSystem(`payme:${body.id ?? 'x'}`, () => api.handle(body)));
  };

  /** Click SHOP API: form-encoded in, flat JSON out, HTTP 200 whatever the verdict. */
  clickShop = async (request: FastifyRequest, reply: FastifyReply) => {
    const api = this.click;
    if (api === undefined) return reply.code(404).send({ ok: false });
    return reply.send(await this.asSystem('click', () => api.handle(request.body as ClickRequest)));
  };

  /** Provider callbacks carry no user; they act as the platform inside the tenant. */
  private asSystem<T>(requestId: string, fn: () => Promise<T>): Promise<T> {
    const context = requireContext();
    return runWithContext(systemContext(context.tenantId, requestId, context.locale), fn);
  }

  private paymeAuthorized(request: FastifyRequest): boolean {
    const header = request.headers['authorization'];
    if (typeof header !== 'string' || !header.startsWith('Basic ') || this.paymeKey === undefined)
      return false;
    const given = Buffer.from(header.slice(6), 'base64');
    const expected = Buffer.from(`Paycom:${this.paymeKey}`);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  webhook = async (request: FastifyRequest, reply: FastifyReply) => {
    const { provider } = params<{ provider: string }>(request);
    await this.service.handleWebhook(provider, {
      headers: request.headers,
      // The raw body, not the parsed object: signatures cover exact bytes.
      rawBody: typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {}),
    });
    return this.ok(reply, { received: true });
  };
}
