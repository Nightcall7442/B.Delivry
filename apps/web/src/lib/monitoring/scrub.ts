/**
 * What must not leave the browser in an error report: the rules live in @bazar/utils/scrub, shared with
 * the API and the admin, so a new kind of secret is masked in all three at once.
 */
export * from '@bazar/utils/scrub';
