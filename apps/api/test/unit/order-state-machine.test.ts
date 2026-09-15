/**
 * The order state machine is the one piece of logic every actor in the system
 * routes through, so it gets the closest test.
 */
import { ORDER_STATUS, ORDER_STATUS_TRANSITIONS, TERMINAL_ORDER_STATUSES } from '@bazar/constants';
import { describe, expect, it } from 'vitest';
import {
  assertActorTransition,
  assertTransition,
  canActorTransition,
  canTransition,
  isTerminal,
} from '../../src/modules/orders/domain/order-state-machine.js';
import { InvalidStateTransitionError } from '../../src/common/errors/domain.errors.js';

describe('order transitions', () => {
  it('walks the whole happy path', () => {
    const path = [
      ORDER_STATUS.PENDING,
      ORDER_STATUS.CONFIRMED,
      ORDER_STATUS.SEARCHING_COURIER,
      ORDER_STATUS.COURIER_ASSIGNED,
      ORDER_STATUS.COURIER_ARRIVED_PICKUP,
      ORDER_STATUS.PICKING_UP,
      ORDER_STATUS.PICKED_UP,
      ORDER_STATUS.IN_DELIVERY,
      ORDER_STATUS.COURIER_ARRIVED,
      ORDER_STATUS.DELIVERED,
    ] as const;

    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it('refuses to skip ahead', () => {
    expect(canTransition(ORDER_STATUS.PENDING, ORDER_STATUS.DELIVERED)).toBe(false);
    expect(canTransition(ORDER_STATUS.CONFIRMED, ORDER_STATUS.PICKED_UP)).toBe(false);
    expect(() => assertTransition(ORDER_STATUS.PENDING, ORDER_STATUS.IN_DELIVERY)).toThrow(
      InvalidStateTransitionError,
    );
  });

  it('never moves out of a fully terminal state', () => {
    expect(ORDER_STATUS_TRANSITIONS[ORDER_STATUS.REFUNDED]).toHaveLength(0);
    for (const status of TERMINAL_ORDER_STATUSES) {
      expect(isTerminal(status)).toBe(true);
    }
  });

  it('sends a dropped order back to the search rather than forward', () => {
    expect(canTransition(ORDER_STATUS.COURIER_ASSIGNED, ORDER_STATUS.SEARCHING_COURIER)).toBe(true);
    // Once the goods are in the bag there is no going back to a search.
    expect(canTransition(ORDER_STATUS.PICKED_UP, ORDER_STATUS.SEARCHING_COURIER)).toBe(false);
  });

  it('has no unreachable status', () => {
    const reachable = new Set<string>([ORDER_STATUS.PENDING]);
    // Repeated passes because a status reached late opens further ones.
    for (let pass = 0; pass < Object.keys(ORDER_STATUS_TRANSITIONS).length; pass += 1) {
      for (const [from, targets] of Object.entries(ORDER_STATUS_TRANSITIONS)) {
        if (!reachable.has(from)) continue;
        for (const target of targets) reachable.add(target);
      }
    }
    expect(reachable.size).toBe(Object.keys(ORDER_STATUS_TRANSITIONS).length);
  });
});

describe('who may make the move', () => {
  it('lets a customer cancel only before pickup', () => {
    expect(canActorTransition('customer', ORDER_STATUS.CONFIRMED, ORDER_STATUS.CANCELLED)).toBe(
      true,
    );
    // After PICKED_UP the goods are bought and carried: support handles it.
    expect(canActorTransition('customer', ORDER_STATUS.PICKED_UP, ORDER_STATUS.CANCELLED)).toBe(
      false,
    );
  });

  it('does not let a customer mark their own order delivered', () => {
    expect(
      canActorTransition('customer', ORDER_STATUS.COURIER_ARRIVED, ORDER_STATUS.DELIVERED),
    ).toBe(false);
    expect(
      canActorTransition('courier', ORDER_STATUS.COURIER_ARRIVED, ORDER_STATUS.DELIVERED),
    ).toBe(true);
  });

  it('lets staff make any legal move but still refuses illegal ones', () => {
    expect(canActorTransition('staff', ORDER_STATUS.PENDING, ORDER_STATUS.CANCELLED)).toBe(true);
    expect(canActorTransition('staff', ORDER_STATUS.PENDING, ORDER_STATUS.DELIVERED)).toBe(false);
    expect(() =>
      assertActorTransition('staff', ORDER_STATUS.PENDING, ORDER_STATUS.DELIVERED),
    ).toThrow(InvalidStateTransitionError);
  });
});
