import { describe, expect, it } from 'vitest';
import { formatMonth, formatRange, monthIndex, spanGeometry, yearTicks } from '~/lib/timeline';

describe('monthIndex', () => {
  it('counts months from year zero', () => {
    expect(monthIndex('2025-01') - monthIndex('2024-12')).toBe(1);
  });

  it('rejects malformed dates', () => {
    expect(() => monthIndex('2025-13')).toThrow();
    expect(() => monthIndex('Nov 2025')).toThrow();
  });
});

describe('spanGeometry', () => {
  const axis = { start: '2020-01', end: '2030-01' };

  it('places a finished span by its months, inclusive of the end month', () => {
    const geometry = spanGeometry({ start: '2020-01', end: '2024-12' }, axis, '2026-10');
    expect(geometry.left).toBe(0);
    expect(geometry.width).toBeCloseTo(50);
    expect(geometry.futureShare).toBe(0);
    expect(geometry.ongoing).toBe(false);
  });

  it('runs an ongoing span up to the current month', () => {
    const geometry = spanGeometry({ start: '2025-01' }, axis, '2025-12');
    expect(geometry.left).toBeCloseTo(50);
    expect(geometry.width).toBeCloseTo(10);
    expect(geometry.ongoing).toBe(true);
  });

  it('marks the part of a span that has not happened yet', () => {
    // 22 months in total, 3 of them by October 2026.
    const geometry = spanGeometry({ start: '2026-08', end: '2028-05' }, axis, '2026-10');
    expect(geometry.futureShare).toBeCloseTo((19 / 22) * 100);
  });

  it('clamps spans that start before the axis', () => {
    const geometry = spanGeometry({ start: '2018-01', end: '2020-12' }, axis, '2026-10');
    expect(geometry.left).toBe(0);
    expect(geometry.width).toBeCloseTo(10);
  });
});

describe('formatting', () => {
  it('formats months and ranges in plain words', () => {
    expect(formatMonth('2025-11')).toBe('Nov 2025');
    expect(formatRange({ start: '2025-11' })).toBe('Nov 2025 to now');
    expect(formatRange({ start: '2026-08', end: '2028-05', expected: true })).toBe('Aug 2026 to May 2028 (expected)');
  });

  it('puts a tick at every January on the axis', () => {
    const ticks = yearTicks({ start: '2019-09', end: '2022-03' });
    expect(ticks.map((tick) => tick.year)).toEqual([2020, 2021, 2022]);
  });
});
