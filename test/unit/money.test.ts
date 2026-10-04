import { describe, it, expect } from 'vitest';
import {
  INR,
  addMinor,
  assertMinorUnits,
  formatMinor,
  isMinorUnits,
  mulMinor,
  parseAmountToMinor,
  pctToFraction,
  scaleMinor,
  subMinor,
  sumMinor,
} from '../../src/domain/money';

const USD = { symbol: '$', minorDigits: 2, indianGrouping: false };
const JPY = { symbol: '¥', minorDigits: 0, indianGrouping: false };

describe('isMinorUnits / assertMinorUnits', () => {
  it('accepts safe integers', () => {
    expect(isMinorUnits(0)).toBe(true);
    expect(isMinorUnits(-12345)).toBe(true);
    expect(assertMinorUnits(42)).toBe(42);
    expect(assertMinorUnits(0)).toBe(0);
  });

  it('rejects non-integers and non-numbers', () => {
    expect(isMinorUnits(1.5)).toBe(false);
    expect(isMinorUnits('5')).toBe(false);
    expect(isMinorUnits(NaN)).toBe(false);
    expect(isMinorUnits(Infinity)).toBe(false);
    expect(() => assertMinorUnits(1.5)).toThrow(TypeError);
    expect(() => assertMinorUnits(Number.MAX_SAFE_INTEGER + 2)).toThrow(TypeError);
  });
});

describe('addMinor / subMinor', () => {
  it('adds exactly', () => {
    expect(addMinor(100, 200)).toBe(300);
    expect(addMinor(100, -50)).toBe(50);
    expect(addMinor(0, 0)).toBe(0);
    expect(addMinor(-100, -200)).toBe(-300);
  });

  it('subtracts exactly', () => {
    expect(subMinor(100, 50)).toBe(50);
    expect(subMinor(100, -50)).toBe(150);
    expect(subMinor(-100, 50)).toBe(-150);
  });

  it('rejects non-integer inputs', () => {
    expect(() => addMinor(1.5, 1)).toThrow(TypeError);
    expect(() => addMinor(1, 1.5)).toThrow(TypeError);
    expect(() => subMinor(1.5, 1)).toThrow(TypeError);
    expect(() => subMinor(1, 1.5)).toThrow(TypeError);
  });

  it('rejects overflow past the safe integer range', () => {
    const MAX = Number.MAX_SAFE_INTEGER;
    expect(() => addMinor(MAX, 1)).toThrow(RangeError);
    expect(() => addMinor(MAX, 2)).toThrow(RangeError);
    expect(() => addMinor(MAX, MAX)).toThrow(RangeError);
    expect(() => subMinor(-MAX, 1)).toThrow(RangeError);
    expect(() => subMinor(-MAX, 2)).toThrow(RangeError);
    // Exactly at the boundary is fine.
    expect(addMinor(MAX, 0)).toBe(MAX);
    expect(subMinor(MAX, 0)).toBe(MAX);
  });
});

describe('mulMinor', () => {
  it('multiplies by an integer count', () => {
    expect(mulMinor(100, 3)).toBe(300);
    expect(mulMinor(100, 0)).toBe(0);
    expect(mulMinor(100, -2)).toBe(-200);
    expect(mulMinor(-100, 4)).toBe(-400);
  });

  it('rejects non-integer multipliers', () => {
    expect(() => mulMinor(100, 0.5)).toThrow(RangeError);
    expect(() => mulMinor(1.5, 2)).toThrow(TypeError);
  });

  it('rejects overflow', () => {
    expect(() => mulMinor(Number.MAX_SAFE_INTEGER, 2)).toThrow(RangeError);
  });
});

describe('sumMinor', () => {
  it('sums exactly', () => {
    expect(sumMinor([])).toBe(0);
    expect(sumMinor([10, 20, -5])).toBe(25);
    expect(sumMinor([1000000, 2000000, -500000])).toBe(2500000);
  });

  it('rejects non-integer members and overflow', () => {
    expect(() => sumMinor([1.5])).toThrow(TypeError);
    expect(() => sumMinor([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError);
  });
});

describe('parseAmountToMinor', () => {
  const IN = { minorDigits: 2 };

  it('parses plain decimals into integer minor units', () => {
    expect(parseAmountToMinor('0.10', IN)).toBe(10);
    expect(parseAmountToMinor('0.20', IN)).toBe(20);
    expect(parseAmountToMinor('123.45', IN)).toBe(12345);
    expect(parseAmountToMinor('1.5', IN)).toBe(150);
    expect(parseAmountToMinor('0', IN)).toBe(0);
    expect(parseAmountToMinor('1234', IN)).toBe(123400);
    expect(parseAmountToMinor('5.', IN)).toBe(500);
  });

  it('handles leading signs', () => {
    expect(parseAmountToMinor('-50', IN)).toBe(-5000);
    expect(parseAmountToMinor('+50', IN)).toBe(5000);
    expect(parseAmountToMinor('-0.01', IN)).toBe(-1);
  });

  it('accepts Indian and Western grouping', () => {
    expect(parseAmountToMinor('12,34,567.89', IN)).toBe(123456789);
    expect(parseAmountToMinor('1,234,567.89', IN)).toBe(123456789);
    expect(parseAmountToMinor('1,23,456', IN)).toBe(12345600);
    expect(parseAmountToMinor('1,234', IN)).toBe(123400);
  });

  it('accepts a currency symbol before or after, in either order with the sign', () => {
    expect(parseAmountToMinor('₹50', { minorDigits: 2, symbol: '₹' })).toBe(5000);
    expect(parseAmountToMinor('50₹', { minorDigits: 2, symbol: '₹' })).toBe(5000);
    expect(parseAmountToMinor('-₹50', { minorDigits: 2, symbol: '₹' })).toBe(-5000);
    expect(parseAmountToMinor('₹-50', { minorDigits: 2, symbol: '₹' })).toBe(-5000);
    expect(parseAmountToMinor('+₹50', { minorDigits: 2, symbol: '₹' })).toBe(5000);
    expect(parseAmountToMinor('₹+50', { minorDigits: 2, symbol: '₹' })).toBe(5000);
  });

  it('trims surrounding whitespace', () => {
    expect(parseAmountToMinor('  50  ', IN)).toBe(5000);
    expect(parseAmountToMinor(' ₹ 50 ', { minorDigits: 2, symbol: '₹' })).toBe(5000);
    expect(parseAmountToMinor('  -12.3 ', IN)).toBe(-1230);
  });

  it('supports zero-decimal currencies (JPY)', () => {
    expect(parseAmountToMinor('1234', JPY)).toBe(1234);
    expect(parseAmountToMinor('-1234', JPY)).toBe(-1234);
    expect(() => parseAmountToMinor('1234.5', JPY)).toThrow(/decimal place/i);
  });

  it('rejects excess decimal precision instead of rounding', () => {
    expect(() => parseAmountToMinor('1.123', IN)).toThrow(/more than 2 decimal place/);
    expect(() => parseAmountToMinor('0.999', IN)).toThrow(/refusing to round/);
  });

  it('rejects malformed amounts', () => {
    const bad = [
      '1.2.3',
      '1234,56',
      '1,234,56',
      '12,34,56',
      '12.34.56',
      '',
      '   ',
      'abc',
      '12a34',
      '.5',
      '50₹50',
      '1,23,4,56',
      ',',
      '1,,234',
    ];
    for (const s of bad) {
      expect(() => parseAmountToMinor(s, { minorDigits: 2, symbol: '₹' }), JSON.stringify(s)).toThrow(RangeError);
    }
  });

  it('rejects more than one currency symbol', () => {
    expect(() => parseAmountToMinor('₹₹50', { minorDigits: 2, symbol: '₹' })).toThrow(RangeError);
    expect(() => parseAmountToMinor('₹50₹', { minorDigits: 2, symbol: '₹' })).toThrow(RangeError);
  });

  it('rejects bad options and non-string input', () => {
    expect(() => parseAmountToMinor('5', { minorDigits: 7 })).toThrow(RangeError);
    expect(() => parseAmountToMinor('5', { minorDigits: -1 })).toThrow(RangeError);
    expect(() => parseAmountToMinor('5', { minorDigits: 2.5 })).toThrow(RangeError);
    // @ts-expect-error testing runtime rejection
    expect(() => parseAmountToMinor(5, IN)).toThrow(TypeError);
  });

  it('always yields an integer', () => {
    for (const s of ['0.10', '123.45', '12,34,567.89', '-1.5']) {
      expect(Number.isInteger(parseAmountToMinor(s, IN)), s).toBe(true);
    }
  });

  it('the canonical invariant: ₹0.10 + ₹0.20 = ₹0.30', () => {
    const a = parseAmountToMinor('0.10', IN);
    const b = parseAmountToMinor('0.20', IN);
    const total = addMinor(a, b);
    expect(total).toBe(30);
    expect(formatMinor(total, INR)).toBe('₹0.30');
  });
});

describe('formatMinor', () => {
  it('formats INR with Indian grouping', () => {
    expect(formatMinor(12345678, INR)).toBe('₹1,23,456.78');
    expect(formatMinor(123456789, INR)).toBe('₹12,34,567.89');
    expect(formatMinor(1234567890, INR)).toBe('₹1,23,45,678.90');
    expect(formatMinor(1000000, INR)).toBe('₹10,000.00');
    expect(formatMinor(1234, INR)).toBe('₹12.34');
    expect(formatMinor(99, INR)).toBe('₹0.99');
  });

  it('formats Western grouping and zero-decimal currencies', () => {
    expect(formatMinor(12345678, USD)).toBe('$123,456.78');
    expect(formatMinor(1234567, USD)).toBe('$12,345.67');
    expect(formatMinor(1234, JPY)).toBe('¥1,234');
    expect(formatMinor(999999, JPY)).toBe('¥999,999');
  });

  it('handles zero and negatives', () => {
    expect(formatMinor(0, INR)).toBe('₹0.00');
    expect(formatMinor(-12345, INR)).toBe('-₹123.45');
    expect(formatMinor(-12345678, USD)).toBe('-$123,456.78');
    expect(formatMinor(-1, JPY)).toBe('-¥1');
  });

  it('supports suffix symbol position', () => {
    expect(formatMinor(12345, INR, { symbolPosition: 'suffix' })).toBe('123.45₹');
    expect(formatMinor(-12345, INR, { symbolPosition: 'suffix' })).toBe('-123.45₹');
  });

  it('rejects non-integer amounts', () => {
    expect(() => formatMinor(1.5, INR)).toThrow(TypeError);
    expect(() => formatMinor(NaN, INR)).toThrow(TypeError);
  });
});

describe('parse <-> format round trips', () => {
  it('round-trips exact values in INR', () => {
    const cases = [0, 1, -1, 30, 12345, -12345678, 123456789, 1234567890];
    for (const m of cases) {
      const formatted = formatMinor(m, INR);
      expect(parseAmountToMinor(formatted, INR), formatted).toBe(m);
    }
  });

  it('round-trips exact values in USD (Western grouping)', () => {
    const cases = [0, 1, -1, 12345, 12345678, -123456789012];
    for (const m of cases) {
      const formatted = formatMinor(m, USD);
      expect(parseAmountToMinor(formatted, USD), formatted).toBe(m);
    }
  });

  it('round-trips zero-decimal JPY', () => {
    for (const m of [0, 1234, -123456789]) {
      const formatted = formatMinor(m, JPY);
      expect(parseAmountToMinor(formatted, JPY), formatted).toBe(m);
    }
  });
});

describe('scaleMinor (exact rational scaling)', () => {
  it('scales exactly when divisible', () => {
    expect(scaleMinor(120000, 125, 12000)).toBe(1250); // ₹1,20,000 at 12.5% per month
    expect(scaleMinor(100, 3, 1)).toBe(300);
    expect(scaleMinor(100, 1, 2)).toBe(50);
    expect(scaleMinor(0, 5, 1)).toBe(0);
  });

  it('rounds half away from zero', () => {
    expect(scaleMinor(100, 1, 3)).toBe(33); // 33.33 -> 33
    expect(scaleMinor(101, 1, 3)).toBe(34); // 33.67 -> 34
    expect(scaleMinor(1, 1, 2)).toBe(1); // 0.5 -> 1
    expect(scaleMinor(-1, 1, 2)).toBe(-1); // -0.5 -> -1
    expect(scaleMinor(-100, 1, 3)).toBe(-33);
    expect(scaleMinor(-101, 1, 3)).toBe(-34);
  });

  it('rejects invalid arguments and overflow', () => {
    expect(() => scaleMinor(1.5, 1, 2)).toThrow(TypeError);
    expect(() => scaleMinor(100, 1.5, 2)).toThrow(RangeError);
    expect(() => scaleMinor(100, -1, 2)).toThrow(RangeError);
    expect(() => scaleMinor(100, 1, 0)).toThrow(RangeError);
    expect(() => scaleMinor(100, 1, -2)).toThrow(RangeError);
    expect(() => scaleMinor(Number.MAX_SAFE_INTEGER, 2, 1)).toThrow(RangeError);
  });
});

describe('pctToFraction', () => {
  it('converts percentages to exact integer fractions', () => {
    expect(pctToFraction(12.5)).toEqual({ num: 125, den: 10 });
    expect(pctToFraction(7)).toEqual({ num: 7, den: 1 });
    expect(pctToFraction(0.1)).toEqual({ num: 1, den: 10 });
    expect(pctToFraction(0)).toEqual({ num: 0, den: 1 });
    expect(pctToFraction(100.25)).toEqual({ num: 10025, den: 100 });
  });

  it('feeds scaleMinor for monthly interest without float drift', () => {
    const f = pctToFraction(12.5);
    // monthly rate = 12.5 / 12 / 100  ->  num / (den * 12 * 100)
    expect(scaleMinor(120000, f.num, f.den * 12 * 100)).toBe(1250);
  });

  it('rejects non-finite, negative, and scientific-notation input', () => {
    expect(() => pctToFraction(-5)).toThrow(RangeError);
    expect(() => pctToFraction(NaN)).toThrow(TypeError);
    expect(() => pctToFraction(Infinity)).toThrow(TypeError);
    expect(() => pctToFraction(1e21)).toThrow(RangeError);
  });
});

describe('INR default', () => {
  it('is the expected INR-style currency', () => {
    expect(INR).toEqual({ symbol: '₹', minorDigits: 2, indianGrouping: true });
  });
});
