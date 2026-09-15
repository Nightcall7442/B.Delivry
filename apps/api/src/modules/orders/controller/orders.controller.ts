/**
 * Orders HTTP controller — thin: validate → call service → map response.
 */
import type { CreateOrderInput } from '@bazar/validation';
import { PAYMENT_METHOD } from '@bazar/constants';
import type { CreateGroupOrderDto } from '@bazar/types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { toOrderDto, toChatMessageDto } from '../../../common/dto/index.js';
import { body, params, query } from '../../../middleware/validation.middleware.js';
import { COURIER_ACTION_STATUS, type CourierAction } from '../domain/order-state-machine.js';
import type { PaymentsService } from '../../payments/service/payments.service.js';
import type { OrdersService } from '../service/orders.service.js';
import type { CourierActionInput, OrdersListQuery } from '../schemas/index.js';

export class OrdersController extends BaseController {
  constructor(
    private readonly service: OrdersService,
    private readonly payments: PaymentsService,
  ) {
    super();
  }

  quote = async (request: FastifyRequest, reply: FastifyReply) => {
    return this.ok(reply, await this.service.quote(body(request)));
  };

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = body<CreateOrderInput>(request);
    const order = await this.service.create({
      storeId: input.storeId,
      addressId: input.addressId,
      paymentMethod: input.paymentMethod,
      comment: input.comment,
      vendorComment: input.vendorComment,
      substitutionPolicy: input.substitutionPolicy,
      couponCode: input.couponCode,
      ...(input.scheduledFor !== undefined ? { scheduledFor: new Date(input.scheduledFor) } : {}),
      recipientName: input.recipientName,
      recipientPhone: input.recipientPhone,
      items: input.items,
    });
    return this.created(reply, toOrderDto(order));
  };

  createGroup = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = body<CreateGroupOrderDto>(request);
    const orders = await this.service.createGroup({
      addressId: input.addressId,
      paymentMethod: input.paymentMethod,
      comment: input.comment,
      vendorComment: input.vendorComment,
      substitutionPolicy: input.substitutionPolicy,
      couponCode: input.couponCode,
      ...(input.scheduledFor !== undefined ? { scheduledFor: new Date(input.scheduledFor) } : {}),
      recipientName: input.recipientName,
      recipientPhone: input.recipientPhone,
      stores: input.stores,
    });
    return this.created(reply, orders.map(toOrderDto));
  };

  quoteGroup = async (request: FastifyRequest, reply: FastifyReply) => {
    return this.ok(reply, await this.service.quoteGroup(body(request)));
  };

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    // from/to arrive as ISO strings and are pulled out of the spread, so the
    // filter never sees both a string and a Date for the same field.
    const { from, to, ...rest } = query<OrdersListQuery>(request);

    const result = await this.service.list({
      ...rest,
      ...(from !== undefined ? { from: new Date(from) } : {}),
      ...(to !== undefined ? { to: new Date(to) } : {}),
    });
    return this.paginated(reply, { ...result, items: result.items.map(toOrderDto) });
  };

  get = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, toOrderDto(await this.service.get(id)));
  };

  getByNumber = async (request: FastifyRequest, reply: FastifyReply) => {
    const { number } = params<{ number: string }>(request);
    return this.ok(reply, toOrderDto(await this.service.getByNumber(number)));
  };

  /** B2B: the bank transfer arrived — an INVOICE payment is created and captured. */
  invoicePaid = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const order = await this.service.markInvoicePaid(id);
    const payment = await this.payments.create({
      orderId: order.id,
      method: PAYMENT_METHOD.INVOICE,
    });
    await this.payments.capture(payment.id);
    return this.ok(reply, toOrderDto(await this.service.get(id)));
  };

  confirm = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, toOrderDto(await this.service.confirm(id)));
  };

  cancel = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const { reason } = body<{ reason: string }>(request);
    return this.ok(reply, toOrderDto(await this.service.cancel(id, reason)));
  };

  /** Operator override: any legal transition, with a reason for the trail. */
  changeStatus = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const input = body<{ status: Parameters<OrdersService['changeStatus']>[1]; comment?: string }>(
      request,
    );
    return this.ok(
      reply,
      toOrderDto(await this.service.changeStatus(id, input.status, 'staff', input.comment)),
    );
  };

  courierAction = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const input = body<CourierActionInput>(request);
    const status = COURIER_ACTION_STATUS[input.action as CourierAction];
    return this.ok(
      reply,
      toOrderDto(await this.service.changeStatus(id, status, 'courier', input.comment)),
    );
  };

  reprice = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const { items } = body<{ items: { orderItemId: string; actualQuantity: number }[] }>(request);
    return this.ok(reply, toOrderDto(await this.service.reprice(id, items)));
  };

  repeat = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const { addressId } = body<{ addressId?: string }>(request);
    return this.created(reply, toOrderDto(await this.service.repeat(id, addressId)));
  };

  listMessages = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, (await this.service.listMessages(id)).map(toChatMessageDto));
  };

  postMessage = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const { text } = body<{ text: string }>(request);
    return this.created(reply, toChatMessageDto(await this.service.postMessage(id, text)));
  };
}
