import { describe, expect, it } from 'vitest';
import { cellValue, countFrame, splitNumbers } from '~/lib/numbers';

describe('splitNumbers and countFrame', () => {
  it('keeps the text around numbers and their formatting', () => {
    const parts = splitNumbers('244 → 25 ms');
    expect(countFrame(parts, 1)).toBe('244 → 25 ms');
    expect(countFrame(parts, 0)).toBe('0 → 0 ms');
  });

  it('keeps decimals and thousands separators while counting', () => {
    const parts = splitNumbers('0.58 → 0.86 over 1,140 games');
    expect(countFrame(parts, 0.5)).toBe('0.29 → 0.43 over 570 games');
    expect(countFrame(parts, 1)).toBe('0.58 → 0.86 over 1,140 games');
  });

  it('leaves scientific notation alone', () => {
    expect(splitNumbers('1.1e-16')).toEqual(['1.1e-16']);
  });
});

describe('cellValue', () => {
  it('reads the first number in a cell', () => {
    expect(cellValue('53.4%')).toBe(53.4);
    expect(cellValue('about 2.95×')).toBe(2.95);
    expect(cellValue('3,941')).toBe(3941);
    expect(cellValue('n/a')).toBeNull();
  });
});
