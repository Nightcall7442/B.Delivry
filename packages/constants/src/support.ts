/**
 * How a customer reaches us. The phone stays null until there is a real desk
 * behind it — a dial pattern on a support screen is worse than no phone.
 */
export const SUPPORT = {
  phone: null as string | null,
  /** The public bot: order statuses, repeat, sign-in, and a human on the other side. */
  telegram: 'https://t.me/bazardelivery_uzbot',
} as const;
