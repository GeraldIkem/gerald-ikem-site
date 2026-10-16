import { describe, expect, it } from 'vitest';
import { Checkout, minorUnits, newReference, roundForCurrency } from '~/lib/payments';

describe('Checkout', () => {
  it('charges a reference once and refuses it after that', () => {
    const checkout = new Checkout();
    const first = checkout.pay('PZ-AAAAAA', '2500.455', 'ZAR');
    const again = checkout.pay('PZ-AAAAAA', '2500.455', 'ZAR');

    expect(first.status).toBe(201);
    expect(first.amount).toBe(2500.46);
    expect(again.status).toBe(409);
    expect(again.steps).toEqual(['validate', 'reference']);
    expect(checkout.charges).toBe(1);
  });

  it('treats a new reference as a new payment', () => {
    const checkout = new Checkout();
    checkout.pay('PZ-AAAAAA', '10', 'AED');
    expect(checkout.pay('PZ-BBBBBB', '10', 'AED').status).toBe(201);
    expect(checkout.charges).toBe(2);
  });

  it('rejects amounts that are not positive numbers', () => {
    const checkout = new Checkout();
    expect(checkout.pay('PZ-1', 'abc', 'NGN').status).toBe(400);
    expect(checkout.pay('PZ-1', '-5', 'NGN').status).toBe(400);
    expect(checkout.pay('PZ-1', '', 'NGN').status).toBe(400);
    expect(checkout.pay('PZ-1', '0.2', 'XAF').status).toBe(400);
    expect(checkout.charges).toBe(0);
  });
});

describe('currency rounding', () => {
  it('knows XAF has no minor unit', () => {
    expect(minorUnits('XAF')).toBe(0);
    expect(minorUnits('ZAR')).toBe(2);
  });

  it('rounds half away from zero without float drift', () => {
    expect(roundForCurrency(1.005, 'ZAR')).toBe(1.01);
    expect(roundForCurrency(2500.5, 'XAF')).toBe(2501);
    expect(roundForCurrency(1234.444, 'NGN')).toBe(1234.44);
  });
});

describe('newReference', () => {
  it('makes readable references without lookalike characters', () => {
    const reference = newReference(() => 0.5);
    expect(reference).toMatch(/^PZ-[A-HJ-NP-Z2-9]{6}$/);
  });
});
