import { describe, expect, it } from 'vitest';
import {
  addDecimals,
  compareDecimals,
  parseDecimal,
  serializeDecimal,
  subtractDecimals,
} from '../../../src/lib/money/decimal';

describe('decimal money operations', () => {
  it('parses exact decimal text and accepts up to two decimal places', () => {
    expect(serializeDecimal(parseDecimal('1.20'))).toBe('1.2');
  });

  it('rejects malformed input and more than two decimal places', () => {
    for (const value of ['', '1e-2', '1,25', '1.000', '1.2\n']) {
      expect(() => parseDecimal(value)).toThrow();
    }
  });

  it('adds and subtracts without binary floating-point errors', () => {
    expect(addDecimals('0.1', '0.2')).toBe('0.3');
    expect(subtractDecimals('0.3', '0.2')).toBe('0.1');
    expect(subtractDecimals('0.1', '0.2')).toBe('-0.1');
  });

  it('compares large decimal values exactly', () => {
    expect(compareDecimals('9007199254740993.01', '9007199254740993.00')).toBe(1);
    expect(compareDecimals('0.10', '0.1')).toBe(0);
  });

  it('serializes large values as plain decimal strings for JSON', () => {
    const serialized = serializeDecimal(parseDecimal('123456789012345678901234567890.01'));

    expect(serialized).toBe('123456789012345678901234567890.01');
    expect(JSON.stringify({ amount: serialized })).toBe(
      '{"amount":"123456789012345678901234567890.01"}',
    );
  });
});
