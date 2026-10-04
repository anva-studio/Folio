import { describe, it, expect } from 'vitest';
import {
  addMonths,
  currentMonthKey,
  daysInCalendarMonth,
  isValidDate,
  isValidMonthKey,
  monthKeyOf,
  monthsBetween,
  todayKey,
} from '../../src/domain/dates';

describe('isValidMonthKey', () => {
  it('accepts well-formed YYYY-MM keys', () => {
    expect(isValidMonthKey('2026-01')).toBe(true);
    expect(isValidMonthKey('2026-12')).toBe(true);
    expect(isValidMonthKey('1999-06')).toBe(true);
  });

  it('rejects malformed keys', () => {
    const bad = ['2026-00', '2026-13', '2026-1', '26-01', '2026', '2026-01-01', '', '2026--1', '2 026-01'];
    for (const s of bad) {
      expect(isValidMonthKey(s), JSON.stringify(s)).toBe(false);
    }
  });
});

describe('daysInCalendarMonth', () => {
  it('handles leap years correctly (Gregorian rules)', () => {
    expect(daysInCalendarMonth(2024, 2)).toBe(29); // divisible by 4
    expect(daysInCalendarMonth(2000, 2)).toBe(29); // divisible by 400
    expect(daysInCalendarMonth(1900, 2)).toBe(28); // divisible by 100, not 400
    expect(daysInCalendarMonth(2023, 2)).toBe(28);
  });

  it('returns correct lengths for other months', () => {
    expect(daysInCalendarMonth(2026, 1)).toBe(31);
    expect(daysInCalendarMonth(2026, 4)).toBe(30);
    expect(daysInCalendarMonth(2026, 11)).toBe(30);
    expect(daysInCalendarMonth(2026, 12)).toBe(31);
  });

  it('rejects out-of-range months', () => {
    expect(() => daysInCalendarMonth(2026, 0)).toThrow(RangeError);
    expect(() => daysInCalendarMonth(2026, 13)).toThrow(RangeError);
  });
});

describe('isValidDate', () => {
  it('accepts real calendar dates', () => {
    expect(isValidDate('2024-02-29')).toBe(true);
    expect(isValidDate('2000-02-29')).toBe(true);
    expect(isValidDate('2026-01-01')).toBe(true);
    expect(isValidDate('2026-12-31')).toBe(true);
  });

  it('rejects impossible dates', () => {
    expect(isValidDate('2026-02-29')).toBe(false); // 2026 not a leap year
    expect(isValidDate('1900-02-29')).toBe(false); // century non-leap
    expect(isValidDate('2026-01-32')).toBe(false);
    expect(isValidDate('2026-00-10')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('2026-04-31')).toBe(false);
  });

  it('rejects malformed strings', () => {
    const bad = ['2026-1-1', '2026/01/01', '2026-01-01x', '', '1-01-2026', '2026-01-1', '2026-1-01'];
    for (const s of bad) {
      expect(isValidDate(s), JSON.stringify(s)).toBe(false);
    }
  });
});

describe('monthKeyOf', () => {
  it('takes the YYYY-MM prefix of a date', () => {
    expect(monthKeyOf('2026-03-15')).toBe('2026-03');
    expect(monthKeyOf('2026-01-01')).toBe('2026-01');
  });
});

describe('addMonths', () => {
  it('moves within and across years', () => {
    expect(addMonths('2026-01', 1)).toBe('2026-02');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2027-01', -1)).toBe('2026-12');
    expect(addMonths('2026-06', 12)).toBe('2027-06');
    expect(addMonths('2026-06', -12)).toBe('2025-06');
    expect(addMonths('2026-01', 0)).toBe('2026-01');
    expect(addMonths('2026-01', 25)).toBe('2028-02');
    expect(addMonths('2026-02', -25)).toBe('2024-01');
  });
});

describe('monthsBetween', () => {
  it('counts whole months between month keys', () => {
    expect(monthsBetween('2026-01', '2026-06')).toBe(5);
    expect(monthsBetween('2020-01', '2026-12')).toBe(83); // 6 years + 11 months
    expect(monthsBetween('2026-01', '2026-01')).toBe(0);
  });

  it('clamps reversed order to 0', () => {
    expect(monthsBetween('2026-06', '2026-01')).toBe(0);
    expect(monthsBetween('2027-01', '2020-01')).toBe(0);
  });
});

describe('currentMonthKey / todayKey', () => {
  it('derives keys from a given Date (local calendar day)', () => {
    const d1 = new Date(2026, 0, 15);
    expect(currentMonthKey(d1)).toBe('2026-01');
    expect(todayKey(d1)).toBe('2026-01-15');

    const d2 = new Date(2026, 11, 31);
    expect(currentMonthKey(d2)).toBe('2026-12');
    expect(todayKey(d2)).toBe('2026-12-31');

    const d3 = new Date(2025, 2, 5);
    expect(currentMonthKey(d3)).toBe('2025-03');
    expect(todayKey(d3)).toBe('2025-03-05');
  });

  it('produces keys that pass the validators', () => {
    const d = new Date(2026, 0, 15);
    expect(isValidMonthKey(currentMonthKey(d))).toBe(true);
    expect(isValidDate(todayKey(d))).toBe(true);
  });
});
