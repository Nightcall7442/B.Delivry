/**
 * Customers HTTP controller — thin: validate → call service → map response.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { body, params, query } from '../../../middleware/validation.middleware.js';
import type { CustomersService } from '../service/customers.service.js';
import type { CustomerListFilters, UpdateCustomerInput } from '../types/index.js';

export class CustomersController extends BaseController {
  constructor(private readonly service: CustomersService) {
    super();
  }

  me = async (_request: FastifyRequest, reply: FastifyReply) =>
    this.ok(reply, await this.service.me());

  referral = async (_request: FastifyRequest, reply: FastifyReply) =>
    this.ok(reply, await this.service.referral());

  applyReferral = async (request: FastifyRequest, reply: FastifyReply) => {
    await this.service.applyReferral(body<{ code: string }>(request).code);
    this.noContent(reply);
  };

  applyBusiness = async (request: FastifyRequest, reply: FastifyReply) => {
    const { companyName, companyInn } = body<{ companyName: string; companyInn: string }>(request);
    return this.ok(reply, await this.service.applyBusiness(companyName, companyInn));
  };

  setBusiness = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(
      reply,
      await this.service.setBusiness(
        id,
        body<{ approved: boolean; creditDays: number; creditLimit: number }>(request),
      ),
    );
  };

  updateMe = async (request: FastifyRequest, reply: FastifyReply) =>
    this.ok(reply, await this.service.updateMe(body<UpdateCustomerInput>(request)));

  list = async (request: FastifyRequest, reply: FastifyReply) =>
    this.paginated(reply, await this.service.list(query<CustomerListFilters>(request)));

  get = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, await this.service.get(id));
  };

  block = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    await this.service.block(id);
    this.noContent(reply);
  };

  unblock = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    await this.service.unblock(id);
    this.noContent(reply);
  };

  credit = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const { amount } = body<{ amount: { amount: number } }>(request);
    await this.service.credit(id, amount.amount);
    this.noContent(reply);
  };
}
