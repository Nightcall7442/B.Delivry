/**
 * Users HTTP controller — thin: validate → call service → map response.
 */
import { toCurrentUserDto, toUserDto } from '../../../common/dto/index.js';
import type { Role } from '@bazar/constants';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { body, params, query } from '../../../middleware/validation.middleware.js';
import type { UsersService } from '../service/users.service.js';
import type { CreateStaffInput, UpdateProfileInput, UserListFilters } from '../types/index.js';

export class UsersController extends BaseController {
  constructor(private readonly service: UsersService) {
    super();
  }

  me = async (_request: FastifyRequest, reply: FastifyReply) =>
    this.ok(reply, toCurrentUserDto(await this.service.me()));

  updateMe = async (request: FastifyRequest, reply: FastifyReply) =>
    this.ok(reply, toUserDto(await this.service.updateProfile(body<UpdateProfileInput>(request))));

  list = async (request: FastifyRequest, reply: FastifyReply) =>
    this.service
      .list(query<UserListFilters>(request))
      .then((page) => this.paginated(reply, { ...page, items: page.items.map(toUserDto) }));

  get = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, toUserDto(await this.service.get(id)));
  };

  create = async (request: FastifyRequest, reply: FastifyReply) =>
    this.created(reply, await this.service.createStaff(body<CreateStaffInput>(request)));

  setRoles = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const { roles } = body<{ roles: Role[] }>(request);
    return this.ok(reply, await this.service.setRoles(id, roles));
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

  setPassword = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const { password } = body<{ password: string }>(request);
    await this.service.setPassword(id, password);
    this.noContent(reply);
  };

  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    await this.service.remove(id);
    this.noContent(reply);
  };
}
