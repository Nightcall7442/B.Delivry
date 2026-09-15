/**
 * Phone normalization decides whether two logins are the same account, so the
 * cases here are the formats real users actually type.
 */
import { describe, expect, it } from 'vitest';
import { formatUzPhone, isUzPhone, maskPhone, normalizeUzPhone } from './phone.js';

describe('normalizeUzPhone', () => {
  it('maps every common format to the same canonical number', () => {
    const forms = [
      '+998901234567',
      '998901234567',
      '901234567',
      '+998 90 123 45 67',
      '90 123-45-67',
      '(90) 123 45 67',
      '+998(90)1234567',
    ];

    for (const form of forms) {
      expect(normalizeUzPhone(form)).toBe('+998901234567');
    }
  });

  it('rejects anything that is not a UZ number', () => {
    for (const invalid of ['', '123', '+7 999 123 45 67', '9012345678', 'not a phone']) {
      expect(normalizeUzPhone(invalid)).toBeNull();
    }
  });

  it('agrees with isUzPhone', () => {
    expect(isUzPhone('90 123 45 67')).toBe(true);
    expect(isUzPhone('+1 555 0100')).toBe(false);
  });
});

describe('display helpers', () => {
  it('masks the middle digits but keeps the ends recognisable', () => {
    const masked = maskPhone('+998901234567');

    expect(masked).toContain('90');
    expect(masked).toContain('67');
    expect(masked).not.toContain('12345');
  });

  it('returns a placeholder rather than leaking a malformed value', () => {
    expect(maskPhone('garbage')).toBe('***');
  });

  it('formats for display', () => {
    expect(formatUzPhone('998901234567')).toBe('+998 90 123 45 67');
  });
});
