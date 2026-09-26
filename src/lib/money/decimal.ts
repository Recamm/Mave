import Big from 'big.js';

export const MAX_DECIMAL_PLACES = 2;

const DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.(\d+))?$/;

export function parseDecimal(value: string): Big {
  if (typeof value !== 'string') {
    throw new TypeError('Amount must be provided as decimal text.');
  }

  const match = DECIMAL_PATTERN.exec(value);

  if (!match) {
    throw new TypeError('Amount must be a plain decimal string.');
  }

  if ((match[1]?.length ?? 0) > MAX_DECIMAL_PLACES) {
    throw new RangeError(`Amount must have at most ${MAX_DECIMAL_PLACES} decimal places.`);
  }

  return new Big(value);
}

export function addDecimals(left: string, right: string): string {
  return serializeDecimal(parseDecimal(left).plus(parseDecimal(right)));
}

export function subtractDecimals(left: string, right: string): string {
  return serializeDecimal(parseDecimal(left).minus(parseDecimal(right)));
}

export function compareDecimals(left: string, right: string): -1 | 0 | 1 {
  const comparison = parseDecimal(left).cmp(parseDecimal(right));

  return comparison < 0 ? -1 : comparison > 0 ? 1 : 0;
}

export function serializeDecimal(value: Big): string {
  return value.toFixed();
}
